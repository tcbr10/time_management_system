import { fromDayNum, toDayNum, weekday, weekIndex } from './dates.js';

export interface Recurrence {
  /** One-off date; when set, the series fields are ignored. */
  date: string | null;
  daysMask: number;
  intervalWeeks: number;
  startDate: string | null;
  endDate: string | null;
}

export interface Schedulable extends Recurrence {
  id: number;
  startMin: number;
  endMin: number;
}

export interface OccurrenceException {
  type: 'skip' | 'move';
  startMin: number | null;
  endMin: number | null;
}

export interface RawOccurrence<E> {
  entry: E;
  date: string;
  start: number;
  end: number;
  moved: boolean;
}

export function exceptionKey(entryId: number, date: string): string {
  return `${entryId}@${date}`;
}

/** Whether the base pattern (ignoring exceptions) puts an occurrence on day `n`. */
export function occursOn(r: Recurrence, n: number): boolean {
  if (r.date) return toDayNum(r.date) === n;
  if (!r.startDate) return false;
  const start = toDayNum(r.startDate);
  if (n < start) return false;
  if (r.endDate && n > toDayNum(r.endDate)) return false;
  if ((r.daysMask & (1 << weekday(n))) === 0) return false;
  return (weekIndex(n) - weekIndex(start)) % Math.max(1, r.intervalWeeks) === 0;
}

/** Expands entries into concrete occurrences within [from, to], applying skips and moves. */
export function expand<E extends Schedulable>(
  entries: readonly E[],
  exceptions: ReadonlyMap<string, OccurrenceException>,
  from: string,
  to: string,
): RawOccurrence<E>[] {
  const first = toDayNum(from);
  const last = toDayNum(to);
  const out: RawOccurrence<E>[] = [];
  for (const entry of entries) {
    for (let n = first; n <= last; n++) {
      if (!occursOn(entry, n)) continue;
      const date = fromDayNum(n);
      const exception = exceptions.get(exceptionKey(entry.id, date));
      if (exception?.type === 'skip') continue;
      const moved =
        exception?.type === 'move' && exception.startMin !== null && exception.endMin !== null;
      out.push({
        entry,
        date,
        start: moved ? exception.startMin! : entry.startMin,
        end: moved ? exception.endMin! : entry.endMin,
        moved,
      });
    }
  }
  out.sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start || b.end - a.end);
  return out;
}
