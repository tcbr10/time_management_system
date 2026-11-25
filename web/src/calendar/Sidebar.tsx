import type { CategoryDto, ConflictDto, Kind, OccurrenceDto, SharesDto, UserDto } from '../api.ts';
import { DOW_SHORT, dow, duration, shortDate } from '../dates.ts';
import { PALETTE } from '../palette.ts';
import { Avatar, Icon, Switch } from '../ui.tsx';
import { occurrenceTitle } from './model.ts';

interface Props {
  me: UserDto;
  users: UserDto[];
  shares: SharesDto | undefined;
  hiddenUsers: number[];
  onToggleUser: (id: number) => void;
  cross: boolean;
  onToggleCross: () => void;
  scopeLabel: string;
  freeMinutes: number;
  conflicts: ConflictDto[];
  load: Record<number, number>;
  byKey: ReadonlyMap<string, OccurrenceDto>;
  onOpenConflict: (conflict: ConflictDto) => void;
  categories: CategoryDto[];
  hiddenCategories: number[];
  onToggleCategory: (id: number) => void;
  onSetCategories: (ids: number[], hidden: boolean) => void;
  onNew: () => void;
}

const MAX_CONFLICTS = 3;

function CategoryGroup(props: { kind: Kind; title: string } & Pick<Props, 'categories' | 'hiddenCategories' | 'onToggleCategory' | 'onSetCategories'>) {
  const group = props.categories.filter((c) => c.kind === props.kind && !c.archived);
  if (group.length === 0) return null;
  const anyShown = group.some((c) => !props.hiddenCategories.includes(c.id));
  return (
    <section className="card">
      <div className="card__head">
        <h2 className="card__title">{props.title}</h2>
        <button type="button" className="link-button" onClick={() => props.onSetCategories(group.map((c) => c.id), anyShown)}>
          {anyShown ? 'הסתרת הכל' : 'הצגת הכל'}
        </button>
      </div>
      <div className="chips">
        {group.map((category) => {
          const on = !props.hiddenCategories.includes(category.id);
          const swatch = PALETTE[category.color];
          const style = !on
            ? undefined
            : props.kind === 'task'
              ? { background: '#FFFFFF', border: `1.5px solid ${swatch.bd}`, color: swatch.fg }
              : { background: swatch.bg, border: `1px solid ${swatch.bd}`, color: swatch.fg };
          return (
            <button key={category.id} type="button" className={on ? 'filter-chip' : 'filter-chip filter-chip--off'} style={style} aria-pressed={on} onClick={() => props.onToggleCategory(category.id)}>
              <span className="dot dot--large" style={{ background: on ? swatch.bd : '#8A96A3' }} />
              {category.name}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function Sidebar(props: Props) {
  const others = props.users.filter((user) => user.id !== props.me.id);
  const conflictLine = (conflict: ConflictDto) => {
    const a = props.byKey.get(conflict.a);
    const b = props.byKey.get(conflict.b);
    return a && b ? `${occurrenceTitle(a)} ↔ ${occurrenceTitle(b)}` : '';
  };

  return (
    <aside className="sidebar">
      <button type="button" className="button button--primary button--block" onClick={props.onNew}>
        <Icon name="plus" />
        שיבוץ חדש
      </button>

      <section className="card">
        <h2 className="card__title">לוחות מוצגים</h2>
        {[props.me, ...others].map((user) => {
          const mine = user.id === props.me.id;
          const level = mine ? 'view' : (props.shares?.received[user.id] ?? 'none');
          const on = !props.hiddenUsers.includes(user.id);
          const note = mine
            ? 'הלוח שלי'
            : level === 'none'
              ? 'לא משתף/ת איתי'
              : level === 'busy'
                ? 'משתף/ת איתי · תפוס בלבד'
                : level === 'edit'
                  ? 'משתף/ת איתי · עריכה'
                  : 'משתף/ת איתי · צפייה';
          return (
            <button key={user.id} type="button" className="toggle-row" aria-pressed={on} disabled={level === 'none'} onClick={() => props.onToggleUser(user.id)}>
              <Avatar user={user} filled={mine} />
              <span className="toggle-row__text">
                <span className="toggle-row__name">{mine ? `${user.displayName} (אני)` : user.displayName}</span>
                <span className="muted">{note}</span>
              </span>
              <Switch on={on && level !== 'none'} />
            </button>
          );
        })}
      </section>

      {others.length > 0 && (
        <section className="card">
          <button type="button" className="toggle-row" aria-pressed={props.cross} onClick={props.onToggleCross}>
            <span className="toggle-row__text">
              <span className="toggle-row__name toggle-row__name--strong">הצלבת לוחות</span>
              <span className="muted">התנגשויות וזמן פנוי משותף</span>
            </span>
            <Switch on={props.cross} />
          </button>
          {props.cross && (
            <div className="cross">
              <span className="muted">{props.scopeLabel}</span>
              <div className="cross__stats">
                <div className="stat stat--free">
                  <span className="stat__value">{duration(props.freeMinutes)}</span>
                  <span>שעות פנויות יחד</span>
                </div>
                <div className={props.conflicts.length > 0 ? 'stat stat--conflict' : 'stat'}>
                  <span className="stat__value">{props.conflicts.length}</span>
                  <span>התנגשויות</span>
                </div>
              </div>
              {props.conflicts.slice(0, MAX_CONFLICTS).map((conflict) => (
                <button key={`${conflict.a}|${conflict.b}`} type="button" className="conflict" onClick={() => props.onOpenConflict(conflict)}>
                  <strong>
                    יום {DOW_SHORT[dow(conflict.date)]} {shortDate(conflict.date)} · {props.users.find((u) => u.id === conflict.userId)?.displayName}
                  </strong>
                  <span>{conflictLine(conflict)}</span>
                </button>
              ))}
              {props.conflicts.length > MAX_CONFLICTS && <span className="muted">ועוד {props.conflicts.length - MAX_CONFLICTS} התנגשויות</span>}
              <div className="cross__load">
                <strong>חלוקת מטלות בית וילדים</strong>
                {props.users.map((user) => (
                  <div key={user.id} className="cross__load-row">
                    <span>{user.displayName}</span>
                    <span className="num">{duration(props.load[user.id] ?? 0)} ש׳</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      <CategoryGroup kind="routine" title="שגרות" {...props} />
      <CategoryGroup kind="task" title="משימות" {...props} />
    </aside>
  );
}
