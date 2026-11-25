// Dates are 'YYYY-MM-DD' strings in the browser's local time; times are minutes from midnight.

export const DOW_LONG = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'] as const;
export const DOW_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'] as const;
const MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
] as const;

const pad = (n: number) => String(n).padStart(2, '0');

function toDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d, 12);
}

function toStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isDateStr(value: string | null): value is string {
  return value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value) && toStr(toDate(value)) === value;
}

export function today(): string {
  return toStr(new Date());
}

export function nowMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

export function addDays(date: string, days: number): string {
  const d = toDate(date);
  d.setDate(d.getDate() + days);
  return toStr(d);
}

export function addMonths(date: string, months: number): string {
  const d = toDate(date);
  return toStr(new Date(d.getFullYear(), d.getMonth() + months, 1, 12));
}

/** 0 = Sunday … 6 = Saturday. */
export function dow(date: string): number {
  return toDate(date).getDay();
}

export function dayOfMonth(date: string): number {
  return toDate(date).getDate();
}

export function sameMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

export function startOfWeek(date: string): string {
  return addDays(date, -dow(date));
}

export function range(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** The full weeks (Sunday to Saturday) that cover the month of `date`. */
export function monthGrid(date: string): { from: string; to: string } {
  const d = toDate(date);
  const first = toStr(new Date(d.getFullYear(), d.getMonth(), 1, 12));
  const last = toStr(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12));
  return { from: startOfWeek(first), to: addDays(startOfWeek(last), 6) };
}

export function hm(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

export function parseHm(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes >= 0 && minutes <= 1440 ? minutes : null;
}

/** '1:30' style duration. */
export function duration(minutes: number): string {
  return `${Math.floor(minutes / 60)}:${pad(minutes % 60)}`;
}

export function timeRange(start: number, end: number): string {
  return `${hm(start)}–${hm(end)}`;
}

export function dayMonth(date: string): string {
  const d = toDate(date);
  return `${d.getDate()} ב${MONTHS[d.getMonth()]}`;
}

export function fullDate(date: string): string {
  const d = toDate(date);
  return `יום ${DOW_LONG[d.getDay()]}, ${dayMonth(date)} ${d.getFullYear()}`;
}

export function weekTitle(from: string, to: string): string {
  const year = toDate(to).getFullYear();
  return sameMonth(from, to)
    ? `${dayOfMonth(from)}–${dayMonth(to)} ${year}`
    : `${dayMonth(from)} – ${dayMonth(to)} ${year}`;
}

export function monthTitle(date: string): string {
  const d = toDate(date);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function shortDate(date: string): string {
  const d = toDate(date);
  return `${d.getDate()}.${d.getMonth() + 1}`;
}

/** 'ימים א׳–ה׳', 'ימי א׳, ג׳' … for a days bitmask (bit 0 = Sunday). */
export function daysLabel(mask: number): string {
  if (mask === 127) return 'כל יום';
  if (mask === 0b0011111) return 'ימים א׳–ה׳';
  const days = DOW_SHORT.filter((_, i) => mask & (1 << i));
  return `${days.length === 1 ? 'יום' : 'ימי'} ${days.join(', ')}`;
}
