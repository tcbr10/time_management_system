import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CalendarDto, CategoryDto, EntryDto, OccurrenceDto, SessionDto, SharesDto } from '../src/shared/types.js';
import { Client, createTestApp, household, type TestApp } from './helpers.js';

// 2026-11-22 is a Sunday.
const SUN = '2026-11-22';
const WEEK = `from=${SUN}&to=2026-11-28`;

let t: TestApp;
beforeEach(async () => {
  t = await createTestApp();
});
afterEach(async () => {
  await t.close();
});

async function categoryId(client: Client, name: string): Promise<number> {
  const { body } = await client.get<CategoryDto[]>('/api/categories');
  return body.find((c) => c.name === name)!.id;
}

function weekly(categoryId: number, extra: Record<string, unknown> = {}) {
  return {
    kind: 'routine', categoryId, title: 'ארוחת ערב', notes: '', start: 1095, end: 1140,
    date: null, daysMask: 0b0011111, intervalWeeks: 1, startDate: SUN, endDate: null,
    isPrivate: false, ...extra,
  };
}

async function week(client: Client): Promise<CalendarDto> {
  return (await client.get<CalendarDto>(`/api/calendar?${WEEK}`)).body;
}

describe('accounts', () => {
  it('requires setup once, then signs users in and out', async () => {
    const client = new Client(t.app);
    expect((await client.get<SessionDto>('/api/session')).body).toEqual({ setupRequired: true, user: null });

    const setup = await client.post('/api/setup', { username: 'Noa', displayName: 'נועה', password: 'correct horse' });
    expect(setup.status).toBe(200);
    expect((await client.get<SessionDto>('/api/session')).body.user).toMatchObject({ username: 'noa', role: 'admin' });
    expect((await client.get<CategoryDto[]>('/api/categories')).body).toHaveLength(11);

    const again = await new Client(t.app).post('/api/setup', { username: 'eve', displayName: 'Eve', password: 'whatever123' });
    expect(again.status).toBe(409);

    await client.post('/api/auth/logout');
    expect((await client.get('/api/categories')).status).toBe(401);
    expect((await client.post('/api/auth/login', { username: 'noa', password: 'wrong password' })).status).toBe(401);
    expect((await client.post('/api/auth/login', { username: 'NOA', password: 'correct horse' })).status).toBe(200);
  });

  it('rejects weak passwords and bad usernames', async () => {
    const client = new Client(t.app);
    expect((await client.post('/api/setup', { username: 'noa', displayName: 'נועה', password: 'short' })).body).toEqual({ error: 'weak_password' });
    expect((await client.post('/api/setup', { username: 'n o a', displayName: 'נועה', password: 'long enough' })).body).toEqual({ error: 'invalid_username' });
  });

  it('lets new members join only through a valid invite, once', async () => {
    const { noa, itai } = await household(t);
    expect((await itai.get<SessionDto>('/api/session')).body.user).toMatchObject({ username: 'itai', role: 'member' });
    expect((await itai.post('/api/invites')).status).toBe(403);

    const invite = await noa.post<{ token: string }>('/api/invites');
    const taken = await new Client(t.app).post(`/api/invites/${invite.body.token}/accept`, {
      username: 'itai', displayName: 'x', password: 'long enough',
    });
    expect(taken.body).toEqual({ error: 'username_taken' });
    const ok = await new Client(t.app).post(`/api/invites/${invite.body.token}/accept`, {
      username: 'dana', displayName: 'דנה', password: 'long enough',
    });
    expect(ok.status).toBe(200);
    const reuse = await new Client(t.app).post(`/api/invites/${invite.body.token}/accept`, {
      username: 'eve', displayName: 'Eve', password: 'long enough',
    });
    expect(reuse.status).toBe(404);
  });

  it('changes a password and lets an admin reset one', async () => {
    const { noa, itai, itaiId } = await household(t);
    expect((await itai.post('/api/auth/password', { current: 'nope', next: 'new password 1' })).status).toBe(401);
    expect((await itai.post('/api/auth/password', { current: 'battery staple', next: 'new password 1' })).status).toBe(200);
    expect((await itai.get('/api/users')).status).toBe(200);

    expect((await itai.post(`/api/users/${itaiId}/password`, { password: 'x'.repeat(10) })).status).toBe(403);
    expect((await noa.post(`/api/users/${itaiId}/password`, { password: 'reset by admin' })).status).toBe(200);
    expect((await itai.get('/api/users')).status).toBe(401);
    expect((await itai.post('/api/auth/login', { username: 'itai', password: 'reset by admin' })).status).toBe(200);
  });
});

describe('entries and calendar', () => {
  it('expands a weekly series and a one-off into the requested range', async () => {
    const { noa } = await household(t);
    const food = await categoryId(noa, 'אוכל');
    const health = await categoryId(noa, 'בריאות');
    await noa.post('/api/entries', weekly(food));
    await noa.post('/api/entries', {
      kind: 'task', categoryId: health, title: 'רופא שיניים', start: 930, end: 1005, date: '2026-11-26',
    });

    const { occurrences } = await week(noa);
    expect(occurrences.filter((o) => o.title === 'ארוחת ערב').map((o) => o.date)).toEqual([
      '2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26',
    ]);
    const dentist = occurrences.find((o) => o.title === 'רופא שיניים')!;
    expect(dentist).toMatchObject({ date: '2026-11-26', recurring: false, kind: 'task', done: false, canEdit: true });
  });

  it('validates entry payloads', async () => {
    const { noa } = await household(t);
    const food = await categoryId(noa, 'אוכל');
    const bad = async (extra: Record<string, unknown>) => (await noa.post<{ error: string }>('/api/entries', weekly(food, extra))).body.error;
    expect(await bad({ end: 1000 })).toBe('invalid_time');
    expect(await bad({ daysMask: 0 })).toBe('invalid_days');
    expect(await bad({ startDate: '2026-13-01' })).toBe('invalid_date');
    expect(await bad({ endDate: '2026-11-01' })).toBe('invalid_date');
    expect(await bad({ title: '  ' })).toBe('invalid_title');
    expect(await bad({ kind: 'task' })).toBe('invalid_category');
    expect(await bad({ participantIds: [999] })).toBe('invalid_participants');
  });

  it('skips, moves and restores a single occurrence', async () => {
    const { noa } = await household(t);
    const entry = (await noa.post<EntryDto>('/api/entries', weekly(await categoryId(noa, 'אוכל')))).body;
    const url = `/api/entries/${entry.id}/occurrences`;

    expect((await noa.put(`${url}/2026-11-23`, { action: 'skip' })).status).toBe(200);
    expect((await noa.put(`${url}/2026-11-24`, { action: 'move', start: 1200, end: 1260 })).status).toBe(200);
    expect((await noa.put(`${url}/2026-11-27`, { action: 'skip' })).status).toBe(404); // a Friday: not in the series

    let occurrences = (await week(noa)).occurrences;
    expect(occurrences.map((o) => o.date)).toEqual(['2026-11-22', '2026-11-24', '2026-11-25', '2026-11-26']);
    expect(occurrences[1]).toMatchObject({ start: 1200, end: 1260, moved: true });

    await noa.put(`${url}/2026-11-23`, { action: 'restore' });
    occurrences = (await week(noa)).occurrences;
    expect(occurrences).toHaveLength(5);
  });

  it('splits a series when editing from a date onward', async () => {
    const { noa } = await household(t);
    const food = await categoryId(noa, 'אוכל');
    const entry = (await noa.post<EntryDto>('/api/entries', weekly(food))).body;
    await noa.put(`/api/entries/${entry.id}/occurrences/2026-11-25`, { action: 'skip' });

    const edited = await noa.put<EntryDto>(
      `/api/entries/${entry.id}?scope=following&date=2026-11-24`,
      weekly(food, { title: 'ארוחת ערב מאוחרת', start: 1140, end: 1200 }),
    );
    expect(edited.body.id).not.toBe(entry.id);
    expect(edited.body.startDate).toBe('2026-11-24');

    const { occurrences } = await week(noa);
    expect(occurrences.map((o) => [o.date, o.title, o.start])).toEqual([
      ['2026-11-22', 'ארוחת ערב', 1095],
      ['2026-11-23', 'ארוחת ערב', 1095],
      ['2026-11-24', 'ארוחת ערב מאוחרת', 1140],
      ['2026-11-25', 'ארוחת ערב מאוחרת', 1140], // the old skip does not carry over
      ['2026-11-26', 'ארוחת ערב מאוחרת', 1140],
    ]);
  });

  it('deletes from a date onward or entirely', async () => {
    const { noa } = await household(t);
    const entry = (await noa.post<EntryDto>('/api/entries', weekly(await categoryId(noa, 'אוכל')))).body;

    await noa.delete(`/api/entries/${entry.id}?scope=following&date=2026-11-25`);
    expect((await week(noa)).occurrences.map((o) => o.date)).toEqual(['2026-11-22', '2026-11-23', '2026-11-24']);

    await noa.delete(`/api/entries/${entry.id}`);
    expect((await week(noa)).occurrences).toEqual([]);
  });

  it('marks one occurrence of a task as done', async () => {
    const { noa } = await household(t);
    const kids = await categoryId(noa, 'ילדים');
    const food = await categoryId(noa, 'אוכל');
    const task = (await noa.post<EntryDto>('/api/entries', weekly(kids, { kind: 'task', title: 'איסוף מהגן' }))).body;
    const routine = (await noa.post<EntryDto>('/api/entries', weekly(food))).body;

    expect((await noa.put(`/api/entries/${routine.id}/occurrences/2026-11-22/done`, { done: true })).body).toEqual({ error: 'not_a_task' });
    await noa.put(`/api/entries/${task.id}/occurrences/2026-11-23/done`, { done: true });

    const done = (await week(noa)).occurrences.filter((o) => o.entryId === task.id).map((o) => o.done);
    expect(done).toEqual([false, true, false, false, false]);

    await noa.put(`/api/entries/${task.id}/occurrences/2026-11-23/done`, { done: false });
    expect((await week(noa)).occurrences.some((o) => o.done)).toBe(false);
  });
});

describe('sharing', () => {
  async function setLevel(owner: Client, granteeId: number, level: string) {
    expect((await owner.put(`/api/shares/${granteeId}`, { level })).status).toBe(200);
  }

  it('starts with mutual view access after an invite', async () => {
    const { noa, itaiId } = await household(t);
    const shares = (await noa.get<SharesDto>('/api/shares')).body;
    expect(shares).toEqual({ granted: { [itaiId]: 'view' }, received: { [itaiId]: 'view' } });
  });

  it('shows another user entries according to the granted level', async () => {
    const { noa, itai, noaId, itaiId } = await household(t);
    const work = await categoryId(noa, 'עבודה');
    const entry = (await noa.post<EntryDto>('/api/entries', weekly(work, { title: 'עבודה', start: 510, end: 960 }))).body;
    const seenByItai = async (): Promise<OccurrenceDto | undefined> => (await week(itai)).occurrences[0];

    expect(await seenByItai()).toMatchObject({ title: 'עבודה', busy: false, canEdit: false, participantIds: [noaId] });
    expect((await itai.put(`/api/entries/${entry.id}`, weekly(work))).status).toBe(403);

    await setLevel(noa, itaiId, 'busy');
    expect(await seenByItai()).toMatchObject({ title: null, categoryId: null, kind: null, notes: null, busy: true, start: 510 });
    expect((await itai.get(`/api/entries/${entry.id}`)).status).toBe(404);

    await setLevel(noa, itaiId, 'none');
    expect(await seenByItai()).toBeUndefined();

    await setLevel(noa, itaiId, 'edit');
    expect(await seenByItai()).toMatchObject({ title: 'עבודה', canEdit: true });
    expect((await itai.put(`/api/entries/${entry.id}`, weekly(work, { title: 'עבודה מהבית' }))).status).toBe(200);
  });

  it('keeps a private entry busy-only even with edit access', async () => {
    const { noa, itai, itaiId } = await household(t);
    await noa.put(`/api/shares/${itaiId}`, { level: 'edit' });
    const self = await categoryId(noa, 'זמן אישי');
    const entry = (await noa.post<EntryDto>('/api/entries', weekly(self, { title: 'הפתעה', isPrivate: true }))).body;

    expect((await week(itai)).occurrences[0]).toMatchObject({ title: null, busy: true, canEdit: false, isPrivate: true });
    expect((await itai.delete(`/api/entries/${entry.id}`)).status).toBe(404);
    expect((await week(noa)).occurrences[0]).toMatchObject({ title: 'הפתעה', busy: false });
  });

  it('only lets you add someone as a participant with their edit grant', async () => {
    const { noa, itai, noaId, itaiId } = await household(t);
    const food = await categoryId(noa, 'אוכל');
    const shared = weekly(food, { participantIds: [noaId, itaiId] });

    expect((await noa.post<{ error: string }>('/api/entries', shared)).body.error).toBe('forbidden_participant');
    await itai.put(`/api/shares/${noaId}`, { level: 'edit' });
    const created = await noa.post<EntryDto>('/api/entries', shared);
    expect(created.body.participantIds).toEqual([noaId, itaiId]);

    // Both participants own a shared entry.
    expect((await week(itai)).occurrences[0]).toMatchObject({ canEdit: true, busy: false });
  });

  it('filters the calendar by user', async () => {
    const { noa, itai, noaId, itaiId } = await household(t);
    const food = await categoryId(noa, 'אוכל');
    await noa.post('/api/entries', weekly(food, { title: 'של נועה' }));
    await itai.post('/api/entries', weekly(food, { title: 'של איתי' }));

    const only = async (id: number) =>
      [...new Set((await noa.get<CalendarDto>(`/api/calendar?${WEEK}&users=${id}`)).body.occurrences.map((o) => o.title))];
    expect(await only(noaId)).toEqual(['של נועה']);
    expect(await only(itaiId)).toEqual(['של איתי']);
  });
});

describe('cross view', () => {
  it('reports conflicts, shared free time and the chore balance', async () => {
    const { noa, itai, noaId, itaiId } = await household(t);
    const work = await categoryId(noa, 'עבודה');
    const kids = await categoryId(noa, 'ילדים');
    const health = await categoryId(noa, 'בריאות');
    const day = '2026-11-26';
    const oneOff = (extra: Record<string, unknown>) => ({ kind: 'routine', categoryId: work, title: 'x', date: day, ...extra });

    await noa.post('/api/entries', oneOff({ title: 'עבודה', start: 450, end: 960 }));
    await noa.post('/api/entries', oneOff({ kind: 'task', categoryId: health, title: 'רופא שיניים', start: 930, end: 1005 }));
    await noa.post('/api/entries', oneOff({ kind: 'task', categoryId: kids, title: 'איסוף', start: 975, end: 1020 }));
    await itai.post('/api/entries', oneOff({ title: 'עבודה', start: 450, end: 1140 }));
    await itai.post('/api/entries', oneOff({ kind: 'task', categoryId: kids, title: 'הסעה', start: 1140, end: 1200, isPrivate: true }));

    const { cross, occurrences } = (await noa.get<CalendarDto>(`/api/calendar?from=${day}&to=${day}`)).body;
    const title = (key: string) => occurrences.find((o) => o.key === key)!.title;

    expect(cross.conflicts.map((c) => [c.userId, title(c.a), title(c.b)])).toEqual([
      [noaId, 'עבודה', 'רופא שיניים'],
      [noaId, 'רופא שיניים', 'איסוף'],
    ]);
    // Active hours default to 07:30–23:00; the only shared gap is after Itai's private hour.
    expect(cross.free).toEqual([{ date: day, start: 1200, end: 1380 }]);
    // Itai's private chore is hidden from Noa, so it is not counted for him.
    expect(cross.load).toEqual({ [noaId]: 45, [itaiId]: 0 });
  });

  it('uses the household active hours, which only an admin can change', async () => {
    const { noa, itai } = await household(t);
    expect((await itai.put('/api/settings', { activeFrom: 480, activeTo: 1320 })).status).toBe(403);
    expect((await noa.put('/api/settings', { activeFrom: 480, activeTo: 1320 })).status).toBe(200);
    const { cross } = (await noa.get<CalendarDto>(`/api/calendar?from=${SUN}&to=${SUN}`)).body;
    expect(cross.free).toEqual([{ date: SUN, start: 480, end: 1320 }]);
  });

  it('rejects oversized or malformed ranges', async () => {
    const { noa } = await household(t);
    expect((await noa.get('/api/calendar?from=2026-01-01&to=2026-06-01')).status).toBe(400);
    expect((await noa.get('/api/calendar?from=2026-01-05&to=2026-01-01')).status).toBe(400);
    expect((await noa.get('/api/calendar?from=nope&to=2026-01-01')).status).toBe(400);
  });
});
