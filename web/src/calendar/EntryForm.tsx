import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import {
  api,
  errorMessage,
  type CategoryDto,
  type EditScope,
  type EntryDto,
  type EntryInput,
  type Kind,
  type SharesDto,
  type UserDto,
} from '../api.ts';
import { DOW_LONG, DOW_SHORT, dayMonth, dow, hm, parseHm } from '../dates.ts';
import { PALETTE } from '../palette.ts';
import { useRefreshAll } from '../queries.ts';
import { ErrorNote, Field, Icon, Segmented } from '../ui.tsx';

export type FormTarget =
  | { type: 'create'; date: string; start: number | null }
  | { type: 'edit'; entryId: number; occurrenceDate: string };

interface Props {
  target: FormTarget;
  me: UserDto;
  users: UserDto[];
  categories: CategoryDto[];
  shares: SharesDto | undefined;
  onClose: () => void;
}

interface FormState {
  kind: Kind;
  title: string;
  categoryId: number | null;
  repeat: 'weekly' | 'once';
  daysMask: number;
  intervalWeeks: number;
  startDate: string;
  endDate: string;
  date: string;
  start: string;
  end: string;
  participantIds: number[];
  isPrivate: boolean;
  notes: string;
}

function blank(target: Extract<FormTarget, { type: 'create' }>, me: UserDto): FormState {
  const start = target.start ?? 12 * 60 + 30;
  return {
    kind: 'routine',
    title: '',
    categoryId: null,
    repeat: 'weekly',
    daysMask: 1 << dow(target.date),
    intervalWeeks: 1,
    startDate: target.date,
    endDate: '',
    date: target.date,
    start: hm(start),
    end: hm(Math.min(start + 60, 1440)),
    participantIds: [me.id],
    isPrivate: false,
    notes: '',
  };
}

function fromEntry(entry: EntryDto, occurrenceDate: string): FormState {
  return {
    kind: entry.kind,
    title: entry.title,
    categoryId: entry.categoryId,
    repeat: entry.date === null ? 'weekly' : 'once',
    daysMask: entry.daysMask || 1 << dow(occurrenceDate),
    intervalWeeks: entry.intervalWeeks,
    startDate: entry.startDate ?? occurrenceDate,
    endDate: entry.endDate ?? '',
    date: entry.date ?? occurrenceDate,
    start: hm(entry.start),
    end: hm(entry.end),
    participantIds: entry.participantIds,
    isPrivate: entry.isPrivate,
    notes: entry.notes,
  };
}

export function EntryForm({ target, me, users, categories, shares, onClose }: Props) {
  const refresh = useRefreshAll();
  const editing = target.type === 'edit';
  const existing = useQuery({
    queryKey: ['entry', editing ? target.entryId : 0],
    queryFn: () => api.get<EntryDto>(`/api/entries/${(target as { entryId: number }).entryId}`),
    enabled: editing,
    staleTime: 0,
  });

  const [form, setForm] = useState<FormState | null>(editing ? null : blank(target, me));
  const [scope, setScope] = useState<EditScope>('all');
  const [localError, setLocalError] = useState<string | null>(null);
  useEffect(() => {
    if (editing && existing.data && form === null) setForm(fromEntry(existing.data, target.occurrenceDate));
  }, [editing, existing.data, form, target]);

  const save = useMutation({
    mutationFn: (input: EntryInput) => {
      if (!editing) return api.post<EntryDto>('/api/entries', input);
      const query = scope === 'following' ? `?scope=following&date=${target.occurrenceDate}` : '';
      return api.put<EntryDto>(`/api/entries/${target.entryId}${query}`, input);
    },
    onSuccess: () => {
      refresh();
      onClose();
    },
  });

  if (form === null) {
    return (
      <div className="drawer" role="dialog" aria-label="עריכת שיבוץ">
        <div className="drawer__head">
          <h2 className="drawer__title">עריכת שיבוץ</h2>
          <button type="button" className="icon-button" aria-label="סגירה" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        {existing.isError ? <ErrorNote message={errorMessage(existing.error)} /> : <p className="muted">טוען…</p>}
      </div>
    );
  }

  const set = (patch: Partial<FormState>) => setForm({ ...form, ...patch });
  const kindCategories = categories.filter((c) => c.kind === form.kind && (!c.archived || c.id === form.categoryId));
  const categoryId = kindCategories.some((c) => c.id === form.categoryId) ? form.categoryId : (kindCategories[0]?.id ?? null);
  // I can put entries in my own calendar and in the calendar of anyone who granted me edit access.
  const selectable = users.filter(
    (user) => user.id === me.id || shares?.received[user.id] === 'edit' || form.participantIds.includes(user.id),
  );
  const wasSeries = editing && existing.data?.date === null;
  const splitting = wasSeries && form.repeat === 'weekly' && scope === 'following';

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const start = parseHm(form.start);
    const end = parseHm(form.end);
    if (!form.title.trim()) return setLocalError('צריך לתת שם לשיבוץ.');
    if (categoryId === null) return setLocalError('בחרו קטגוריה.');
    if (start === null || end === null || end <= start) return setLocalError('שעת הסיום צריכה להיות אחרי שעת ההתחלה.');
    if (form.repeat === 'weekly' && form.daysMask === 0) return setLocalError('בחרו לפחות יום אחד.');
    if (form.participantIds.length === 0) return setLocalError('בחרו לפחות משתתף אחד.');
    setLocalError(null);
    const weekly = form.repeat === 'weekly';
    save.mutate({
      kind: form.kind,
      categoryId,
      title: form.title.trim(),
      notes: form.notes.trim(),
      start,
      end,
      date: weekly ? null : form.date,
      daysMask: weekly ? form.daysMask : 0,
      intervalWeeks: weekly ? form.intervalWeeks : 1,
      startDate: weekly ? form.startDate : null,
      endDate: weekly && form.endDate ? form.endDate : null,
      isPrivate: form.isPrivate,
      participantIds: form.participantIds,
    });
  };

  const toggleParticipant = (id: number) =>
    set({ participantIds: form.participantIds.includes(id) ? form.participantIds.filter((p) => p !== id) : [...form.participantIds, id] });

  return (
    <form className="drawer" role="dialog" aria-label={editing ? 'עריכת שיבוץ' : 'שיבוץ חדש'} onSubmit={submit}>
      <div className="drawer__head">
        <h2 className="drawer__title">{editing ? 'עריכת שיבוץ' : 'שיבוץ חדש'}</h2>
        <button type="button" className="icon-button" aria-label="סגירה" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>

      {wasSeries && form.repeat === 'weekly' && (
        <Segmented
          label="היקף השינוי"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'all', label: 'כל הסדרה' },
            { value: 'following', label: `מ־${dayMonth(target.occurrenceDate)} והלאה` },
          ]}
        />
      )}

      <Segmented
        label="סוג השיבוץ"
        value={form.kind}
        onChange={(kind) => set({ kind, categoryId: null })}
        options={[
          { value: 'routine', label: 'שגרה' },
          { value: 'task', label: 'משימה' },
        ]}
      />

      <Field label="שם" htmlFor="entry-title">
        <input id="entry-title" className="input" value={form.title} maxLength={120} placeholder="לדוגמה: ארוחת צהריים" onChange={(e) => set({ title: e.target.value })} />
      </Field>

      <Field label="קטגוריה">
        <div className="chips">
          {kindCategories.map((category) => {
            const on = category.id === categoryId;
            const swatch = PALETTE[category.color];
            return (
              <button
                key={category.id}
                type="button"
                className="filter-chip"
                aria-pressed={on}
                style={on ? { background: swatch.bg, border: `1.5px solid ${swatch.bd}`, color: swatch.fg } : undefined}
                onClick={() => set({ categoryId: category.id })}
              >
                {category.name}
              </button>
            );
          })}
        </div>
      </Field>

      <Segmented
        label="חזרה"
        value={form.repeat}
        onChange={(repeat) => set({ repeat })}
        options={[
          { value: 'weekly', label: 'קבוע בשבוע' },
          { value: 'once', label: 'חד־פעמי' },
        ]}
      />

      {form.repeat === 'weekly' ? (
        <>
          <Field label="ימים">
            <div className="day-pills">
              {DOW_SHORT.map((label, index) => {
                const on = (form.daysMask & (1 << index)) !== 0;
                return (
                  <button key={label} type="button" className={on ? 'day-pill day-pill--on' : 'day-pill'} aria-pressed={on} aria-label={`יום ${DOW_LONG[index]}`} onClick={() => set({ daysMask: form.daysMask ^ (1 << index) })}>
                    {label}
                  </button>
                );
              })}
            </div>
          </Field>
          <div className="field-pair">
            <Field label="תדירות" htmlFor="entry-interval">
              <select id="entry-interval" className="input" value={form.intervalWeeks} onChange={(e) => set({ intervalWeeks: Number(e.target.value) })}>
                <option value={1}>כל שבוע</option>
                <option value={2}>כל שבועיים</option>
                <option value={3}>כל 3 שבועות</option>
                <option value={4}>כל 4 שבועות</option>
              </select>
            </Field>
            {!splitting && (
              <Field label="החל מ־" htmlFor="entry-start-date">
                <input id="entry-start-date" className="input" type="date" required value={form.startDate} onChange={(e) => set({ startDate: e.target.value })} />
              </Field>
            )}
          </div>
          <Field label="עד תאריך (לא חובה)" htmlFor="entry-end-date">
            <input id="entry-end-date" className="input" type="date" value={form.endDate} min={form.startDate} onChange={(e) => set({ endDate: e.target.value })} />
          </Field>
        </>
      ) : (
        <Field label="תאריך" htmlFor="entry-date">
          <input id="entry-date" className="input" type="date" required value={form.date} onChange={(e) => set({ date: e.target.value })} />
        </Field>
      )}

      <div className="field-pair">
        <Field label="התחלה" htmlFor="entry-start">
          <input id="entry-start" className="input" type="time" required value={form.start} onChange={(e) => set({ start: e.target.value })} />
        </Field>
        <Field label="סיום" htmlFor="entry-end">
          <input id="entry-end" className="input" type="time" required value={form.end} onChange={(e) => set({ end: e.target.value })} />
        </Field>
      </div>

      {selectable.length > 1 && (
        <Field label="של מי">
          <div className="chips">
            {selectable.map((user) => {
              const on = form.participantIds.includes(user.id);
              return (
                <button key={user.id} type="button" className={on ? 'filter-chip filter-chip--picked' : 'filter-chip'} aria-pressed={on} onClick={() => toggleParticipant(user.id)}>
                  {user.id === me.id ? 'אני' : user.displayName}
                </button>
              );
            })}
          </div>
        </Field>
      )}

      <button type="button" className="check-row" aria-pressed={form.isPrivate} onClick={() => set({ isPrivate: !form.isPrivate })}>
        <span className={form.isPrivate ? 'checkbox checkbox--large checkbox--on' : 'checkbox checkbox--large'} />
        פרטי – מי שאינו משתתף רואה רק ״תפוס״
      </button>

      <Field label="הערות (לא חובה)" htmlFor="entry-notes">
        <textarea id="entry-notes" className="input input--area" rows={2} maxLength={1000} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
      </Field>

      <ErrorNote message={localError ?? (save.error ? errorMessage(save.error) : null)} />
      <button type="submit" className="button button--primary button--block" disabled={save.isPending}>
        {editing ? 'שמירה' : 'הוספה ללוח'}
      </button>
    </form>
  );
}
