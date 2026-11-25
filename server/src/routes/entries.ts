import { and, eq, gte } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Ctx } from '../context.js';
import {
  categories,
  entries,
  entryExceptions,
  entryParticipants,
  taskCompletions,
  users,
} from '../db/schema.js';
import { accessFor, canEdit, canSeeDetails, type ShareLookup } from '../engine/access.js';
import { addDays, isDate, toDayNum } from '../engine/dates.js';
import { occursOn } from '../engine/recurrence.js';
import { bodyObject, HttpError, idParam, int, requireUser, str, type UserRow } from '../http.js';
import { KINDS, MINUTES_PER_DAY, type EntryDto, type EntryInput, type Kind } from '../shared/types.js';
import { loadEntry, shareLookup, toEntryDto, type EntryRecord } from '../store.js';

type Db = Ctx['db'];
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

function parseTimes(body: Record<string, unknown>): { start: number; end: number } {
  const start = int(body.start, 0, MINUTES_PER_DAY - 1, 'invalid_time');
  const end = int(body.end, 1, MINUTES_PER_DAY, 'invalid_time');
  if (end <= start) throw new HttpError(400, 'invalid_time');
  return { start, end };
}

/** Validates a full entry payload. `existing` relaxes the archived-category rule on edits. */
function parseEntry(
  db: Db,
  body: Record<string, unknown>,
  viewer: UserRow,
  share: ShareLookup,
  existing?: EntryRecord,
): EntryInput {
  if (!KINDS.includes(body.kind as Kind)) throw new HttpError(400, 'invalid_kind');
  const kind = body.kind as Kind;

  const categoryId = int(body.categoryId, 1, Number.MAX_SAFE_INTEGER, 'invalid_category');
  const category = db.select().from(categories).where(eq(categories.id, categoryId)).get();
  if (!category || category.kind !== kind) throw new HttpError(400, 'invalid_category');
  if (category.archived && existing?.categoryId !== categoryId) throw new HttpError(400, 'invalid_category');

  const times = parseTimes(body);
  const notes = body.notes === undefined ? '' : str(body.notes, 0, 1000, 'invalid_notes');

  let recurrence: Pick<EntryInput, 'date' | 'daysMask' | 'intervalWeeks' | 'startDate' | 'endDate'>;
  if (body.date !== null && body.date !== undefined) {
    if (!isDate(body.date)) throw new HttpError(400, 'invalid_date');
    recurrence = { date: body.date, daysMask: 0, intervalWeeks: 1, startDate: null, endDate: null };
  } else {
    if (!isDate(body.startDate)) throw new HttpError(400, 'invalid_date');
    const endDate = body.endDate ?? null;
    if (endDate !== null && (!isDate(endDate) || endDate < body.startDate)) {
      throw new HttpError(400, 'invalid_date');
    }
    recurrence = {
      date: null,
      daysMask: int(body.daysMask, 1, 127, 'invalid_days'),
      intervalWeeks: body.intervalWeeks === undefined ? 1 : int(body.intervalWeeks, 1, 8, 'invalid_interval'),
      startDate: body.startDate,
      endDate,
    };
  }

  const rawParticipants = body.participantIds ?? [viewer.id];
  if (!Array.isArray(rawParticipants) || rawParticipants.length === 0) {
    throw new HttpError(400, 'invalid_participants');
  }
  const participantIds = [...new Set(rawParticipants.map((id) => int(id, 1, Number.MAX_SAFE_INTEGER, 'invalid_participants')))];
  const known = new Set(db.select({ id: users.id }).from(users).all().map((u) => u.id));
  for (const id of participantIds) {
    if (!known.has(id)) throw new HttpError(400, 'invalid_participants');
    // Putting something in another person's calendar needs their 'edit' grant,
    // unless they already take part in the entry being edited.
    const alreadyIn = existing?.participantIds.includes(id) ?? false;
    if (id !== viewer.id && !alreadyIn && share(id, viewer.id) !== 'edit') {
      throw new HttpError(403, 'forbidden_participant');
    }
  }

  return {
    kind,
    categoryId,
    title: str(body.title, 1, 120, 'invalid_title'),
    notes,
    ...times,
    ...recurrence,
    isPrivate: body.isPrivate === true,
    participantIds: participantIds.sort((a, b) => a - b),
  };
}

function toRow(input: EntryInput) {
  return {
    kind: input.kind,
    categoryId: input.categoryId,
    title: input.title,
    notes: input.notes,
    startMin: input.start,
    endMin: input.end,
    date: input.date,
    daysMask: input.daysMask,
    intervalWeeks: input.intervalWeeks,
    startDate: input.startDate,
    endDate: input.endDate,
    isPrivate: input.isPrivate,
  };
}

function insertEntry(tx: Tx, ownerId: number, input: EntryInput): number {
  const row = tx.insert(entries).values({ ...toRow(input), ownerId }).returning({ id: entries.id }).get();
  tx.insert(entryParticipants)
    .values(input.participantIds.map((userId) => ({ entryId: row.id, userId })))
    .run();
  return row.id;
}

function parseScope(request: FastifyRequest): { scope: 'all' | 'following'; date: string | null } {
  const query = request.query as { scope?: string; date?: string };
  if (query.scope === undefined || query.scope === 'all') return { scope: 'all', date: null };
  if (query.scope !== 'following' || !isDate(query.date)) throw new HttpError(400, 'invalid_scope');
  return { scope: 'following', date: query.date };
}

function dateParam(request: FastifyRequest): string {
  const { date } = request.params as { date: string };
  if (!isDate(date)) throw new HttpError(404, 'not_found');
  return date;
}

export function registerEntryRoutes(app: FastifyInstance, ctx: Ctx): void {
  const { db } = ctx;

  /** Loads an entry the viewer may edit, hiding its existence otherwise. */
  function editable(request: FastifyRequest): { viewer: UserRow; entry: EntryRecord; share: ShareLookup } {
    const viewer = requireUser(request);
    const entry = loadEntry(db, idParam(request));
    const share = shareLookup(db);
    if (!entry) throw new HttpError(404, 'not_found');
    const access = accessFor(viewer.id, entry.participantIds, entry.isPrivate, share);
    if (!canSeeDetails(access)) throw new HttpError(404, 'not_found');
    if (!canEdit(access)) throw new HttpError(403, 'forbidden');
    return { viewer, entry, share };
  }

  app.post('/api/entries', async (request): Promise<EntryDto> => {
    const viewer = requireUser(request);
    const input = parseEntry(db, bodyObject(request), viewer, shareLookup(db));
    const id = db.transaction((tx) => insertEntry(tx, viewer.id, input));
    ctx.changed();
    return toEntryDto(loadEntry(db, id)!);
  });

  app.get('/api/entries/:id', async (request): Promise<EntryDto> => {
    const viewer = requireUser(request);
    const entry = loadEntry(db, idParam(request));
    if (!entry) throw new HttpError(404, 'not_found');
    const access = accessFor(viewer.id, entry.participantIds, entry.isPrivate, shareLookup(db));
    if (!canSeeDetails(access)) throw new HttpError(404, 'not_found');
    return toEntryDto(entry);
  });

  // scope=all rewrites the entry. scope=following&date=D ends the series the day before D
  // and starts a new one from D with the new details, so earlier occurrences keep their history.
  app.put('/api/entries/:id', async (request): Promise<EntryDto> => {
    const { viewer, entry, share } = editable(request);
    const { scope, date } = parseScope(request);
    const input = parseEntry(db, bodyObject(request), viewer, share, entry);

    const split =
      scope === 'following' && date !== null && entry.date === null && input.date === null &&
      entry.startDate !== null && date > entry.startDate;

    const id = db.transaction((tx) => {
      if (split) {
        tx.update(entries).set({ endDate: addDays(date, -1) }).where(eq(entries.id, entry.id)).run();
        const newId = insertEntry(tx, entry.ownerId, { ...input, startDate: date });
        tx.delete(entryExceptions)
          .where(and(eq(entryExceptions.entryId, entry.id), gte(entryExceptions.date, date)))
          .run();
        tx.update(taskCompletions)
          .set({ entryId: newId })
          .where(and(eq(taskCompletions.entryId, entry.id), gte(taskCompletions.date, date)))
          .run();
        return newId;
      }
      tx.update(entries).set(toRow(input)).where(eq(entries.id, entry.id)).run();
      tx.delete(entryParticipants).where(eq(entryParticipants.entryId, entry.id)).run();
      tx.insert(entryParticipants)
        .values(input.participantIds.map((userId) => ({ entryId: entry.id, userId })))
        .run();
      if (input.start !== entry.startMin || input.end !== entry.endMin) {
        // Moved occurrences were relative to the old hours.
        tx.delete(entryExceptions)
          .where(and(eq(entryExceptions.entryId, entry.id), eq(entryExceptions.type, 'move')))
          .run();
      }
      return entry.id;
    });
    ctx.changed();
    return toEntryDto(loadEntry(db, id)!);
  });

  app.delete('/api/entries/:id', async (request) => {
    const { entry } = editable(request);
    const { scope, date } = parseScope(request);
    const truncate =
      scope === 'following' && date !== null && entry.date === null &&
      entry.startDate !== null && date > entry.startDate;
    db.transaction((tx) => {
      if (!truncate) {
        tx.delete(entries).where(eq(entries.id, entry.id)).run();
        return;
      }
      tx.update(entries).set({ endDate: addDays(date, -1) }).where(eq(entries.id, entry.id)).run();
      tx.delete(entryExceptions)
        .where(and(eq(entryExceptions.entryId, entry.id), gte(entryExceptions.date, date)))
        .run();
      tx.delete(taskCompletions)
        .where(and(eq(taskCompletions.entryId, entry.id), gte(taskCompletions.date, date)))
        .run();
    });
    ctx.changed();
    return { ok: true };
  });

  // Skip, move or restore one occurrence of a series.
  app.put('/api/entries/:id/occurrences/:date', async (request) => {
    const { entry } = editable(request);
    const date = dateParam(request);
    const body = bodyObject(request);
    if (entry.date !== null) throw new HttpError(400, 'not_recurring');
    if (!occursOn(entry, toDayNum(date))) throw new HttpError(404, 'not_found');

    const key = and(eq(entryExceptions.entryId, entry.id), eq(entryExceptions.date, date));
    if (body.action === 'restore') {
      db.delete(entryExceptions).where(key).run();
    } else if (body.action === 'skip' || body.action === 'move') {
      const times = body.action === 'move' ? parseTimes(body) : null;
      const value = {
        type: body.action,
        startMin: times?.start ?? null,
        endMin: times?.end ?? null,
      } as const;
      db.insert(entryExceptions)
        .values({ entryId: entry.id, date, ...value })
        .onConflictDoUpdate({ target: [entryExceptions.entryId, entryExceptions.date], set: value })
        .run();
    } else {
      throw new HttpError(400, 'invalid_action');
    }
    ctx.changed();
    return { ok: true };
  });

  app.put('/api/entries/:id/occurrences/:date/done', async (request) => {
    const { viewer, entry } = editable(request);
    const date = dateParam(request);
    const done = bodyObject(request).done === true;
    if (entry.kind !== 'task') throw new HttpError(400, 'not_a_task');
    if (!occursOn(entry, toDayNum(date))) throw new HttpError(404, 'not_found');

    if (done) {
      db.insert(taskCompletions)
        .values({ entryId: entry.id, date, doneBy: viewer.id, doneAt: Date.now() })
        .onConflictDoNothing()
        .run();
    } else {
      db.delete(taskCompletions)
        .where(and(eq(taskCompletions.entryId, entry.id), eq(taskCompletions.date, date)))
        .run();
    }
    ctx.changed();
    return { ok: true };
  });
}
