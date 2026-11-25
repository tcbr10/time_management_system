import type { FastifyInstance } from 'fastify';
import type { Ctx } from '../context.js';
import { categories, entryExceptions, taskCompletions, users } from '../db/schema.js';
import { accessFor, canEdit, canSeeDetails, type Access } from '../engine/access.js';
import { computeCross } from '../engine/cross.js';
import { fromDayNum, isDate, toDayNum } from '../engine/dates.js';
import { exceptionKey, expand, type OccurrenceException } from '../engine/recurrence.js';
import { HttpError, requireUser } from '../http.js';
import type { CalendarDto, OccurrenceDto } from '../shared/types.js';
import { loadEntries, loadHouseholdSettings, shareLookup } from '../store.js';

const MAX_RANGE_DAYS = 62;
const MIN_FREE_MINUTES = 60;

export function registerCalendarRoutes(app: FastifyInstance, ctx: Ctx): void {
  const { db } = ctx;

  // Occurrences of the requested users in [from, to], as the signed-in user may see them,
  // plus the cross view (conflicts, shared free time, chore balance) computed over the same set.
  app.get('/api/calendar', async (request): Promise<CalendarDto> => {
    const viewer = requireUser(request);
    const query = request.query as { from?: string; to?: string; users?: string };
    if (!isDate(query.from) || !isDate(query.to)) throw new HttpError(400, 'invalid_range');
    const first = toDayNum(query.from);
    const last = toDayNum(query.to);
    if (last < first || last - first >= MAX_RANGE_DAYS) throw new HttpError(400, 'invalid_range');

    const allUserIds = db.select({ id: users.id }).from(users).all().map((u) => u.id);
    const targets =
      query.users === undefined
        ? allUserIds
        : query.users.split(',').map(Number).filter((id) => allUserIds.includes(id));

    const share = shareLookup(db);
    const access = new Map<number, Access>();
    const visible = loadEntries(db).filter((entry) => {
      if (!entry.participantIds.some((id) => targets.includes(id))) return false;
      const level = accessFor(viewer.id, entry.participantIds, entry.isPrivate, share);
      access.set(entry.id, level);
      return level !== 'none';
    });

    const exceptions = new Map<string, OccurrenceException>();
    for (const row of db.select().from(entryExceptions).all()) {
      exceptions.set(exceptionKey(row.entryId, row.date), row);
    }
    const completed = new Set(
      db.select().from(taskCompletions).all().map((row) => exceptionKey(row.entryId, row.date)),
    );
    const chore = new Map(db.select().from(categories).all().map((c) => [c.id, c.isChore]));

    const raw = expand(visible, exceptions, query.from, query.to);
    const occurrences: OccurrenceDto[] = raw.map(({ entry, date, start, end, moved }) => {
      const level = access.get(entry.id)!;
      const details = canSeeDetails(level);
      const key = exceptionKey(entry.id, date);
      return {
        key,
        entryId: entry.id,
        date,
        start,
        end,
        participantIds: entry.participantIds,
        busy: !details,
        canEdit: canEdit(level),
        kind: details ? entry.kind : null,
        categoryId: details ? entry.categoryId : null,
        title: details ? entry.title : null,
        notes: details ? entry.notes : null,
        isPrivate: entry.isPrivate,
        recurring: entry.date === null,
        moved,
        done: details && entry.kind === 'task' && completed.has(key),
      };
    });

    const dates: string[] = [];
    for (let n = first; n <= last; n++) dates.push(fromDayNum(n));
    const household = loadHouseholdSettings(db);
    const cross = computeCross(
      occurrences.map((o) => ({
        key: o.key,
        date: o.date,
        start: o.start,
        end: o.end,
        participantIds: o.participantIds,
        // A busy-only entry keeps its category to itself, so it cannot count as a chore.
        chore: o.categoryId !== null && chore.get(o.categoryId) === true,
      })),
      { userIds: targets, dates, activeFrom: household.activeFrom, activeTo: household.activeTo, minFree: MIN_FREE_MINUTES },
    );

    return { occurrences, cross };
  });
}
