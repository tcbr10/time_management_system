import type { OccurrenceDto } from '../api.ts';
import { DOW_LONG, dayMonth, dayOfMonth, dow, hm, sameMonth } from '../dates.ts';
import { PALETTE } from '../palette.ts';
import { blockStyle, occurrenceTitle, type CategoryMap } from './model.ts';

interface Props {
  days: string[];
  anchor: string;
  occurrences: OccurrenceDto[];
  categories: CategoryMap;
  conflictDates: ReadonlySet<string>;
  today: string;
  onOpenDay: (date: string) => void;
}

const MAX_CHIPS = 3;

export function MonthGrid(props: Props) {
  // A series would flood every cell, so recurring entries collapse into one dot per category.
  // Named chips are kept for what stands out in a month: one-offs and moved occurrences.
  const named = (o: OccurrenceDto) => !o.recurring || o.moved;

  const orderedCategories = [...props.categories.values()].sort((a, b) => a.sort - b.sort);

  return (
    <div className="grid-scroll">
      <div className="month">
        <div className="month__head">
          {DOW_LONG.map((name) => (
            <div key={name}>{name}</div>
          ))}
        </div>
        <div className="month__body">
          {props.days.map((date) => {
            const items = props.occurrences.filter((o) => o.date === date);
            const chips = items.filter(named);
            const dotCategories = new Set(items.filter((o) => !named(o)).map((o) => o.categoryId));
            const inMonth = sameMonth(date, props.anchor);
            const isToday = date === props.today;
            return (
              <button
                key={date}
                type="button"
                className={inMonth ? 'month-cell' : 'month-cell month-cell--outside'}
                aria-label={`יום ${DOW_LONG[dow(date)]}, ${dayMonth(date)} – ${items.length} שיבוצים`}
                onClick={() => props.onOpenDay(date)}
              >
                <span className="month-cell__top">
                  <span className={isToday ? 'day-num day-num--small day-num--today' : 'day-num day-num--small'}>{dayOfMonth(date)}</span>
                  {props.conflictDates.has(date) && <span className="month-cell__conflict">התנגשות</span>}
                </span>
                <span className="month-cell__dots">
                  {orderedCategories
                    .filter((category) => dotCategories.has(category.id))
                    .map((category) => (
                      <span key={category.id} className="dot" style={{ background: PALETTE[category.color].bd }} />
                    ))}
                  {dotCategories.has(null) && <span className="dot dot--busy" />}
                </span>
                {chips.slice(0, MAX_CHIPS).map((o) => (
                  <span key={o.key} className={o.done ? 'chip chip--done' : 'chip'} style={blockStyle(o, props.categories)}>
                    {hm(o.start)} {occurrenceTitle(o)}
                  </span>
                ))}
                {chips.length > MAX_CHIPS && <span className="month-cell__more">+{chips.length - MAX_CHIPS} נוספים</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
