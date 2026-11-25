import { eq, inArray } from 'drizzle-orm';
import type { Ctx } from './context.js';
import { entries, entryParticipants, settings, shares } from './db/schema.js';
import type { ShareLookup } from './engine/access.js';
import type { EntryDto, HouseholdSettingsDto, ShareLevel } from './shared/types.js';

type Db = Ctx['db'];

export type EntryRecord = typeof entries.$inferSelect & { participantIds: number[] };

export function shareLookup(db: Db): ShareLookup {
  const levels = new Map<string, ShareLevel>();
  for (const row of db.select().from(shares).all()) {
    levels.set(`${row.ownerId}>${row.granteeId}`, row.level);
  }
  return (ownerId, granteeId) => levels.get(`${ownerId}>${granteeId}`) ?? 'none';
}

function attachParticipants(db: Db, rows: (typeof entries.$inferSelect)[]): EntryRecord[] {
  if (rows.length === 0) return [];
  const byEntry = new Map<number, number[]>();
  const links = db
    .select()
    .from(entryParticipants)
    .where(inArray(entryParticipants.entryId, rows.map((row) => row.id)))
    .all();
  for (const link of links) {
    const list = byEntry.get(link.entryId);
    if (list) list.push(link.userId);
    else byEntry.set(link.entryId, [link.userId]);
  }
  return rows.map((row) => ({ ...row, participantIds: (byEntry.get(row.id) ?? []).sort((a, b) => a - b) }));
}

// A household has at most a few hundred entries, so loading them all per request is cheap
// and keeps permission checks in one place instead of spread across SQL.
export function loadEntries(db: Db): EntryRecord[] {
  return attachParticipants(db, db.select().from(entries).all());
}

export function loadEntry(db: Db, id: number): EntryRecord | undefined {
  return attachParticipants(db, db.select().from(entries).where(eq(entries.id, id)).all())[0];
}

export function toEntryDto(entry: EntryRecord): EntryDto {
  return {
    id: entry.id,
    ownerId: entry.ownerId,
    kind: entry.kind,
    categoryId: entry.categoryId,
    title: entry.title,
    notes: entry.notes,
    start: entry.startMin,
    end: entry.endMin,
    date: entry.date,
    daysMask: entry.daysMask,
    intervalWeeks: entry.intervalWeeks,
    startDate: entry.startDate,
    endDate: entry.endDate,
    isPrivate: entry.isPrivate,
    participantIds: entry.participantIds,
  };
}

const DEFAULT_SETTINGS: HouseholdSettingsDto = { activeFrom: 450, activeTo: 1380 };

export function loadHouseholdSettings(db: Db): HouseholdSettingsDto {
  const row = db.select().from(settings).where(eq(settings.key, 'household')).get();
  if (!row) return DEFAULT_SETTINGS;
  return { ...DEFAULT_SETTINGS, ...(JSON.parse(row.value) as Partial<HouseholdSettingsDto>) };
}

export function saveHouseholdSettings(db: Db, value: HouseholdSettingsDto): void {
  const json = JSON.stringify(value);
  db.insert(settings)
    .values({ key: 'household', value: json })
    .onConflictDoUpdate({ target: settings.key, set: { value: json } })
    .run();
}
