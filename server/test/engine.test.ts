import { describe, expect, it } from 'vitest';
import { accessFor } from '../src/engine/access.js';
import { computeCross, type CrossOccurrence } from '../src/engine/cross.js';
import { addDays, isDate, toDayNum, weekday } from '../src/engine/dates.js';
import { expand, occursOn, type OccurrenceException, type Schedulable } from '../src/engine/recurrence.js';

// 2026-11-22 is a Sunday.
const SUN = '2026-11-22';

function series(partial: Partial<Schedulable>): Schedulable {
  return {
    id: 1, startMin: 420, endMin: 480, date: null, daysMask: 0b0010101, intervalWeeks: 1,
    startDate: SUN, endDate: null, ...partial,
  };
}

describe('dates', () => {
  it('validates real calendar dates only', () => {
    expect(isDate('2026-02-28')).toBe(true);
    expect(isDate('2026-02-30')).toBe(false);
    expect(isDate('2026-2-3')).toBe(false);
    expect(isDate(20260228)).toBe(false);
  });

  it('knows weekdays and crosses month and DST boundaries by whole days', () => {
    expect(weekday(toDayNum(SUN))).toBe(0);
    expect(weekday(toDayNum('2026-11-28'))).toBe(6);
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    // Israel switches to summer time on 2026-03-27; dates must not drift.
    expect(addDays('2026-03-26', 2)).toBe('2026-03-28');
  });
});

describe('recurrence', () => {
  it('repeats on the chosen weekdays from the start date', () => {
    const s = series({});
    const days = [0, 1, 2, 3, 4, 5, 6].map((i) => occursOn(s, toDayNum(addDays(SUN, i))));
    expect(days).toEqual([true, false, true, false, true, false, false]);
    expect(occursOn(s, toDayNum(addDays(SUN, -7)))).toBe(false);
  });

  it('stops after the end date', () => {
    const s = series({ endDate: addDays(SUN, 2) });
    expect(occursOn(s, toDayNum(addDays(SUN, 2)))).toBe(true);
    expect(occursOn(s, toDayNum(addDays(SUN, 4)))).toBe(false);
  });

  it('honours an every-N-weeks interval counted in Sunday-started weeks', () => {
    // Starts on a Wednesday, repeats Sundays and Wednesdays every second week.
    const s = series({ daysMask: 0b0001001, intervalWeeks: 2, startDate: addDays(SUN, 3) });
    expect(occursOn(s, toDayNum(SUN))).toBe(false); // before the start
    expect(occursOn(s, toDayNum(addDays(SUN, 3)))).toBe(true);
    expect(occursOn(s, toDayNum(addDays(SUN, 7)))).toBe(false); // off week
    expect(occursOn(s, toDayNum(addDays(SUN, 14)))).toBe(true);
    expect(occursOn(s, toDayNum(addDays(SUN, 17)))).toBe(true);
  });

  it('treats a dated entry as a single occurrence', () => {
    const s = series({ date: addDays(SUN, 5), daysMask: 0, startDate: null });
    expect(occursOn(s, toDayNum(addDays(SUN, 5)))).toBe(true);
    expect(occursOn(s, toDayNum(addDays(SUN, 12)))).toBe(false);
  });

  it('applies skipped and moved occurrences when expanding', () => {
    const exceptions = new Map<string, OccurrenceException>([
      [`1@${addDays(SUN, 2)}`, { type: 'skip', startMin: null, endMin: null }],
      [`1@${addDays(SUN, 4)}`, { type: 'move', startMin: 600, endMin: 660 }],
    ]);
    const result = expand([series({})], exceptions, SUN, addDays(SUN, 6));
    expect(result.map((o) => [o.date, o.start, o.end, o.moved])).toEqual([
      [SUN, 420, 480, false],
      [addDays(SUN, 4), 600, 660, true],
    ]);
  });
});

describe('access', () => {
  const share = (level: 'none' | 'busy' | 'view' | 'edit') => () => level;

  it('gives participants full access', () => {
    expect(accessFor(1, [1, 2], true, share('none'))).toBe('own');
  });

  it('uses the level a participant granted', () => {
    expect(accessFor(2, [1], false, share('view'))).toBe('view');
    expect(accessFor(2, [1], false, share('none'))).toBe('none');
  });

  it('caps a private entry at busy for non-participants', () => {
    expect(accessFor(2, [1], true, share('edit'))).toBe('busy');
    expect(accessFor(2, [1], true, share('none'))).toBe('none');
  });
});

describe('cross', () => {
  const occ = (key: string, start: number, end: number, participantIds: number[], chore = false): CrossOccurrence => ({
    key, date: SUN, start, end, participantIds, chore,
  });
  const options = { userIds: [1, 2], dates: [SUN], activeFrom: 450, activeTo: 1380, minFree: 60 };

  it('flags overlaps of the same person, once per pair', () => {
    const cross = computeCross(
      [occ('a', 600, 700, [1]), occ('b', 650, 720, [1]), occ('c', 650, 720, [2]), occ('d', 700, 760, [1, 2])],
      options,
    );
    expect(cross.conflicts).toEqual([
      { userId: 1, date: SUN, a: 'a', b: 'b' },
      { userId: 1, date: SUN, a: 'b', b: 'd' },
      { userId: 2, date: SUN, a: 'c', b: 'd' },
    ]);
  });

  it('finds windows where nobody is scheduled, within active hours', () => {
    const cross = computeCross(
      [occ('a', 420, 540, [1]), occ('b', 500, 600, [2]), occ('c', 630, 1200, [1]), occ('d', 1300, 1350, [2])],
      options,
    );
    // 600–630 is too short; 1350–1380 is too short.
    expect(cross.free).toEqual([{ date: SUN, start: 1200, end: 1300 }]);
  });

  it('sums chore minutes per participant', () => {
    const cross = computeCross(
      [occ('a', 600, 660, [1], true), occ('b', 700, 730, [1, 2], true), occ('c', 800, 900, [2])],
      options,
    );
    expect(cross.load).toEqual({ 1: 90, 2: 30 });
  });
});
