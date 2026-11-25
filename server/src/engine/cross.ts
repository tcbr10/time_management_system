import type { ConflictDto, CrossDto, FreeWindowDto } from '../shared/types.js';

export interface CrossOccurrence {
  key: string;
  date: string;
  start: number;
  end: number;
  participantIds: readonly number[];
  /** True when the entry's category counts as a household chore and may be revealed. */
  chore: boolean;
}

export interface CrossOptions {
  userIds: readonly number[];
  dates: readonly string[];
  activeFrom: number;
  activeTo: number;
  /** Shortest shared free window worth reporting, in minutes. */
  minFree: number;
}

function byDate(occurrences: readonly CrossOccurrence[]): Map<string, CrossOccurrence[]> {
  const map = new Map<string, CrossOccurrence[]>();
  for (const occurrence of occurrences) {
    const list = map.get(occurrence.date);
    if (list) list.push(occurrence);
    else map.set(occurrence.date, [occurrence]);
  }
  return map;
}

/** Pairs of overlapping occurrences that the same person takes part in. */
export function findConflicts(
  occurrences: readonly CrossOccurrence[],
  userIds: readonly number[],
): ConflictDto[] {
  const conflicts: ConflictDto[] = [];
  const seen = new Set<string>();
  for (const [date, list] of byDate(occurrences)) {
    for (const userId of userIds) {
      const mine = list.filter((o) => o.participantIds.includes(userId));
      for (let i = 0; i < mine.length; i++) {
        for (let j = i + 1; j < mine.length; j++) {
          const a = mine[i]!;
          const b = mine[j]!;
          if (!(a.start < b.end && b.start < a.end)) continue;
          const pair = `${a.key}|${b.key}`;
          if (seen.has(pair)) continue;
          seen.add(pair);
          conflicts.push({ userId, date, a: a.key, b: b.key });
        }
      }
    }
  }
  return conflicts;
}

/** Windows inside the active hours in which none of the given users has anything scheduled. */
export function findFreeWindows(
  occurrences: readonly CrossOccurrence[],
  options: CrossOptions,
): FreeWindowDto[] {
  const grouped = byDate(occurrences);
  const windows: FreeWindowDto[] = [];
  for (const date of options.dates) {
    const busy = (grouped.get(date) ?? [])
      .filter((o) => o.participantIds.some((id) => options.userIds.includes(id)))
      .sort((a, b) => a.start - b.start);
    let cursor = options.activeFrom;
    for (const o of busy) {
      if (o.start > cursor && cursor < options.activeTo) {
        windows.push({ date, start: cursor, end: Math.min(o.start, options.activeTo) });
      }
      cursor = Math.max(cursor, o.end);
    }
    if (cursor < options.activeTo) windows.push({ date, start: cursor, end: options.activeTo });
  }
  return windows.filter((w) => w.end - w.start >= options.minFree);
}

export function computeCross(
  occurrences: readonly CrossOccurrence[],
  options: CrossOptions,
): CrossDto {
  const load: Record<number, number> = {};
  for (const userId of options.userIds) load[userId] = 0;
  for (const o of occurrences) {
    if (!o.chore) continue;
    for (const userId of o.participantIds) {
      if (userId in load) load[userId]! += o.end - o.start;
    }
  }
  return {
    conflicts: findConflicts(occurrences, options.userIds),
    free: options.userIds.length > 0 ? findFreeWindows(occurrences, options) : [],
    load,
  };
}
