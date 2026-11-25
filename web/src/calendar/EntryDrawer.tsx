import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorMessage, type OccurrenceAction, type OccurrenceDto, type UserDto } from '../api.ts';
import { fullDate, hm, parseHm, timeRange } from '../dates.ts';
import { useRefreshAll } from '../queries.ts';
import { ErrorNote, Field, Icon } from '../ui.tsx';
import { blockStyle, occurrenceTitle, participantNames, type CategoryMap } from './model.ts';

interface Props {
  occurrence: OccurrenceDto;
  users: UserDto[];
  categories: CategoryMap;
  /** Other occurrences that overlap this one for the same person. */
  conflictsWith: OccurrenceDto[];
  onClose: () => void;
  onEdit: () => void;
}

type Mode = 'view' | 'move' | 'delete';

export function EntryDrawer({ occurrence, users, categories, conflictsWith, onClose, onEdit }: Props) {
  const refresh = useRefreshAll();
  const [mode, setMode] = useState<Mode>('view');
  const [start, setStart] = useState(hm(occurrence.start));
  const [end, setEnd] = useState(hm(occurrence.end));

  const entryUrl = `/api/entries/${occurrence.entryId}`;
  const occurrenceUrl = `${entryUrl}/occurrences/${occurrence.date}`;
  const run = useMutation({
    mutationFn: (request: () => Promise<unknown>) => request(),
    onSuccess: (_data, _request, _context) => refresh(),
  });
  const act = (request: () => Promise<unknown>, closeAfter: boolean) =>
    run.mutate(request, { onSuccess: () => (closeAfter ? onClose() : setMode('view')) });
  const occurrenceAction = (action: OccurrenceAction, closeAfter: boolean) => act(() => api.put(occurrenceUrl, action), closeAfter);

  const category = occurrence.categoryId === null ? undefined : categories.get(occurrence.categoryId);
  const owner = participantNames(occurrence, users);
  const kindLabel = occurrence.busy
    ? 'פרטי'
    : `${occurrence.kind === 'task' ? (occurrence.recurring ? 'משימה קבועה' : 'משימה חד־פעמית') : occurrence.recurring ? 'שגרה' : 'אירוע חד־פעמי'} · ${category?.name ?? ''}`;

  const submitMove = () => {
    const s = parseHm(start);
    const e = parseHm(end);
    if (s === null || e === null) return;
    occurrenceAction({ action: 'move', start: s, end: e }, false);
  };

  return (
    <div className="drawer" role="dialog" aria-label="פרטי שיבוץ">
      <div className="drawer__head">
        <span className="tag" style={blockStyle(occurrence, categories)}>
          {kindLabel}
        </span>
        <button type="button" className="icon-button" aria-label="סגירה" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <h2 className="drawer__title">{occurrenceTitle(occurrence)}</h2>
      <dl className="facts">
        <dt>מתי</dt>
        <dd>
          {fullDate(occurrence.date)} · {timeRange(occurrence.start, occurrence.end)}
          {occurrence.moved && ' (הוזז חד־פעמית)'}
        </dd>
        <dt>של מי</dt>
        <dd>{owner}</dd>
        {!occurrence.busy && (
          <>
            <dt>חזרה</dt>
            <dd>{occurrence.recurring ? 'סדרה שבועית' : 'חד־פעמי'}</dd>
            <dt>נראות</dt>
            <dd>{occurrence.isPrivate ? 'פרטי – אחרים רואים רק ״תפוס״' : 'לפי הגדרות השיתוף'}</dd>
          </>
        )}
        {occurrence.notes && (
          <>
            <dt>הערות</dt>
            <dd className="facts__notes">{occurrence.notes}</dd>
          </>
        )}
      </dl>

      {conflictsWith.length > 0 && (
        <div className="note note--error">
          <strong>התנגשות</strong>
          {conflictsWith.map((other) => (
            <span key={other.key}>
              חופף ל: {occurrenceTitle(other)} ({timeRange(other.start, other.end)})
            </span>
          ))}
        </div>
      )}
      {occurrence.busy && <p className="note">הפריט פרטי אצל {owner}. רואים רק שהזמן תפוס, בלי שם ובלי קטגוריה.</p>}
      {!occurrence.busy && !occurrence.canEdit && <p className="note">פריט של {owner}. ההרשאה שלך בלוח הזה: צפייה בלבד.</p>}
      <ErrorNote message={run.error ? errorMessage(run.error) : null} />

      {occurrence.canEdit && mode === 'view' && (
        <div className="drawer__actions">
          {occurrence.kind === 'task' && (
            <button type="button" className="button button--primary" disabled={run.isPending} onClick={() => act(() => api.put(`${occurrenceUrl}/done`, { done: !occurrence.done }), false)}>
              {occurrence.done ? 'ביטול סימון' : 'סימון כבוצע'}
            </button>
          )}
          <button type="button" className="button" onClick={onEdit}>
            עריכה
          </button>
          {occurrence.recurring && (
            <button type="button" className="button" onClick={() => setMode('move')}>
              הזזה חד־פעמית
            </button>
          )}
          {occurrence.recurring && occurrence.moved && (
            <button type="button" className="button" disabled={run.isPending} onClick={() => occurrenceAction({ action: 'restore' }, false)}>
              החזרה לשעה הרגילה
            </button>
          )}
          <button type="button" className="button button--danger" onClick={() => setMode('delete')}>
            מחיקה
          </button>
        </div>
      )}

      {mode === 'move' && (
        <div className="drawer__panel">
          <p className="muted">משנה את השעות רק ביום הזה. שאר הסדרה נשארת כמו שהיא.</p>
          <div className="field-pair">
            <Field label="התחלה" htmlFor="move-start">
              <input id="move-start" className="input" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label="סיום" htmlFor="move-end">
              <input id="move-end" className="input" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </Field>
          </div>
          <div className="drawer__actions">
            <button type="button" className="button button--primary" disabled={run.isPending} onClick={submitMove}>
              שמירה
            </button>
            <button type="button" className="button" onClick={() => setMode('view')}>
              ביטול
            </button>
          </div>
        </div>
      )}

      {mode === 'delete' && (
        <div className="drawer__panel">
          {occurrence.recurring ? (
            <>
              <p className="muted">מה למחוק?</p>
              <button type="button" className="button" disabled={run.isPending} onClick={() => occurrenceAction({ action: 'skip' }, true)}>
                רק את המופע הזה
              </button>
              <button type="button" className="button" disabled={run.isPending} onClick={() => act(() => api.del(`${entryUrl}?scope=following&date=${occurrence.date}`), true)}>
                את המופע הזה וכל הבאים
              </button>
              <button type="button" className="button button--danger" disabled={run.isPending} onClick={() => act(() => api.del(entryUrl), true)}>
                את כל הסדרה
              </button>
            </>
          ) : (
            <>
              <p className="muted">למחוק את ״{occurrence.title}״?</p>
              <button type="button" className="button button--danger" disabled={run.isPending} onClick={() => act(() => api.del(entryUrl), true)}>
                מחיקה
              </button>
            </>
          )}
          <button type="button" className="button" onClick={() => setMode('view')}>
            ביטול
          </button>
        </div>
      )}
    </div>
  );
}
