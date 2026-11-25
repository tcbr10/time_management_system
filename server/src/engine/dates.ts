// Calendar dates are 'YYYY-MM-DD' strings with no time zone. Arithmetic goes through a
// day number (days since 1970-01-01), which sidesteps daylight-saving shifts entirely.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

export function toDayNum(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return Math.floor(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

export function fromDayNum(n: number): string {
  return new Date(n * MS_PER_DAY).toISOString().slice(0, 10);
}

export function isDate(value: unknown): value is string {
  return typeof value === 'string' && DATE_RE.test(value) && fromDayNum(toDayNum(value)) === value;
}

/** 0 = Sunday … 6 = Saturday. Day 0 (1970-01-01) was a Thursday. */
export function weekday(n: number): number {
  return (((n + 4) % 7) + 7) % 7;
}

/** Index of the Sunday-started week containing day `n`. */
export function weekIndex(n: number): number {
  return Math.floor((n + 4) / 7);
}

export function addDays(date: string, days: number): string {
  return fromDayNum(toDayNum(date) + days);
}
