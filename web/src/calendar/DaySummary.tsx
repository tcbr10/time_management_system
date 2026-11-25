import type { OccurrenceDto, UserDto } from '../api.ts';
import { duration, timeRange } from '../dates.ts';
import { PALETTE } from '../palette.ts';
import { participantNames, type CategoryMap } from './model.ts';

interface Props {
  occurrences: OccurrenceDto[];
  lanes: UserDto[];
  users: UserDto[];
  categories: CategoryMap;
  onToggleDone: (occurrence: OccurrenceDto) => void;
  onPick: (key: string) => void;
}

export function DaySummary(props: Props) {
  const tasks = props.occurrences.filter((o) => o.kind === 'task');

  // Minutes per category per user. Busy-only entries have no category and are left out.
  const totals = new Map<number, Map<number, number>>();
  for (const o of props.occurrences) {
    if (o.categoryId === null) continue;
    const row = totals.get(o.categoryId) ?? new Map<number, number>();
    for (const userId of o.participantIds) row.set(userId, (row.get(userId) ?? 0) + (o.end - o.start));
    totals.set(o.categoryId, row);
  }
  const rows = [...props.categories.values()].filter((c) => totals.has(c.id)).sort((a, b) => a.sort - b.sort);

  return (
    <aside className="day-summary">
      <section className="card">
        <h2 className="card__title">משימות היום</h2>
        {tasks.length === 0 && <p className="muted">אין משימות משובצות ליום הזה.</p>}
        {tasks.map((task) => (
          <div key={task.key} className="task-row">
            <button
              type="button"
              className="task-row__check"
              aria-pressed={task.done}
              aria-label={`${task.done ? 'ביטול סימון' : 'סימון כבוצע'}: ${task.title}`}
              disabled={!task.canEdit}
              onClick={() => props.onToggleDone(task)}
            >
              <span className={task.done ? 'checkbox checkbox--large checkbox--on' : 'checkbox checkbox--large'} />
            </button>
            <button type="button" className="task-row__body" onClick={() => props.onPick(task.key)}>
              <span className={task.done ? 'task-row__title task-row__title--done' : 'task-row__title'}>{task.title}</span>
              <span className="muted">
                {timeRange(task.start, task.end)} · {props.categories.get(task.categoryId!)?.name} · {participantNames(task, props.users)}
              </span>
            </button>
          </div>
        ))}
      </section>
      {rows.length > 0 && (
        <section className="card">
          <h2 className="card__title">שעות לפי סוג</h2>
          <table className="hours-table">
            <thead>
              <tr>
                <th scope="col">
                  <span className="visually-hidden">קטגוריה</span>
                </th>
                {props.lanes.map((lane) => (
                  <th key={lane.id} scope="col">
                    {lane.displayName}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((category) => (
                <tr key={category.id}>
                  <th scope="row">
                    <span className="dot dot--large" style={{ background: PALETTE[category.color].bd }} />
                    {category.name}
                  </th>
                  {props.lanes.map((lane) => {
                    const minutes = totals.get(category.id)?.get(lane.id) ?? 0;
                    return <td key={lane.id}>{minutes > 0 ? duration(minutes) : '–'}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </aside>
  );
}
