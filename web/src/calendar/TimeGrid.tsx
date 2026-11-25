import { useEffect, useState, type MouseEvent } from 'react';
import type { FreeWindowDto, OccurrenceDto, UserDto } from '../api.ts';
import { DOW_LONG, DOW_SHORT, dayMonth, dayOfMonth, dow, hm, nowMinutes, timeRange } from '../dates.ts';
import { blockStyle, layoutDay, occurrenceTitle, participantNames, type CategoryMap, type Placed } from './model.ts';

const HOUR_HEIGHT = 52;
const MIN_BLOCK_HEIGHT = 22;

interface Props {
  view: 'day' | 'week';
  days: string[];
  occurrences: OccurrenceDto[];
  lanes: UserDto[];
  users: UserDto[];
  categories: CategoryMap;
  conflictKeys: ReadonlySet<string>;
  free: FreeWindowDto[];
  selectedKey: string | null;
  today: string;
  onPick: (key: string) => void;
  onToggleDone: (occurrence: OccurrenceDto) => void;
  onOpenDay: (date: string) => void;
  onCreate: (date: string, start: number) => void;
}

function useNowMinutes(): number {
  const [now, setNow] = useState(nowMinutes);
  useEffect(() => {
    const timer = setInterval(() => setNow(nowMinutes()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function TimeGrid(props: Props) {
  const now = useNowMinutes();
  // Show 06:00–23:00, widening when something is scheduled outside it.
  const firstHour = Math.min(6, ...props.occurrences.map((o) => Math.floor(o.start / 60)));
  const lastHour = Math.max(23, ...props.occurrences.map((o) => Math.ceil(o.end / 60)));
  const top = (minutes: number) => ((minutes - firstHour * 60) / 60) * HOUR_HEIGHT;
  const hours = Array.from({ length: lastHour - firstHour }, (_, i) => firstHour + i);
  const laneIds = props.lanes.map((lane) => lane.id);
  const showLaneHeads = props.lanes.length > 1 || props.view === 'day';
  // Week lanes are too narrow for a full time range; the block's height already shows the end.
  const compact = props.view === 'week' && props.lanes.length > 1;

  const createAt = (date: string) => (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const minutes = firstHour * 60 + ((event.clientY - rect.top) / HOUR_HEIGHT) * 60;
    props.onCreate(date, Math.min(Math.floor(minutes / 30) * 30, 23 * 60));
  };

  const renderBlock = ({ occurrence, left, width, layer }: Placed) => {
    const height = Math.max(((occurrence.end - occurrence.start) / 60) * HOUR_HEIGHT, MIN_BLOCK_HEIGHT);
    const isTask = occurrence.kind === 'task';
    const selected = props.selectedKey === occurrence.key;
    const conflict = props.conflictKeys.has(occurrence.key);
    const title = occurrenceTitle(occurrence);
    const classes = ['block'];
    if (selected) classes.push('block--selected');
    else if (conflict) classes.push('block--conflict');
    if (occurrence.done) classes.push('block--done');
    if (height < 40) classes.push('block--short');
    return (
      <div
        key={occurrence.key}
        className="block-slot"
        style={{ top: top(occurrence.start), height, insetInlineStart: `${left}%`, width: `${width}%`, zIndex: layer }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={classes.join(' ')} style={blockStyle(occurrence, props.categories)}>
          {isTask && (
            <button
              type="button"
              className="block__check"
              aria-pressed={occurrence.done}
              aria-label={`${occurrence.done ? 'ביטול סימון' : 'סימון כבוצע'}: ${title}`}
              disabled={!occurrence.canEdit}
              onClick={() => props.onToggleDone(occurrence)}
            >
              <span className={occurrence.done ? 'checkbox checkbox--on' : 'checkbox'} />
            </button>
          )}
          <button
            type="button"
            className="block__body"
            aria-label={`${title}, ${timeRange(occurrence.start, occurrence.end)}, ${participantNames(occurrence, props.users)}`}
            onClick={() => props.onPick(occurrence.key)}
          >
            <span className="block__title">{title}</span>
            {height >= 40 && <span className="block__time">{compact ? hm(occurrence.start) : timeRange(occurrence.start, occurrence.end)}</span>}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="grid-scroll">
      <div className={props.view === 'week' ? 'time-grid time-grid--week' : 'time-grid'}>
        <div className="time-grid__head">
          <div className="time-grid__gutter" />
          {props.days.map((date) => {
            const isToday = date === props.today;
            return (
              <div key={date} className={dow(date) >= 5 ? 'day-head day-head--weekend' : 'day-head'}>
                <button
                  type="button"
                  className="day-head__button"
                  aria-label={`יום ${DOW_LONG[dow(date)]}, ${dayMonth(date)}`}
                  onClick={() => props.onOpenDay(date)}
                >
                  <span className="day-head__dow">{props.view === 'day' ? `יום ${DOW_LONG[dow(date)]}` : DOW_SHORT[dow(date)]}</span>
                  <span className={isToday ? 'day-num day-num--today' : 'day-num'}>{dayOfMonth(date)}</span>
                </button>
                {showLaneHeads && (
                  <div className="day-head__lanes">
                    {props.lanes.map((lane) => (
                      <span key={lane.id}>{props.view === 'day' ? lane.displayName : lane.displayName.slice(0, 1)}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="time-grid__body" style={{ height: hours.length * HOUR_HEIGHT }}>
          <div className="time-grid__gutter">
            {hours.map((hour) => (
              <span key={hour} className="hour-label" style={{ top: top(hour * 60) + 4 }}>
                {hm(hour * 60)}
              </span>
            ))}
          </div>
          {props.days.map((date) => {
            const dayItems = props.occurrences.filter((o) => o.date === date);
            return (
              <div
                key={date}
                className={dow(date) >= 5 ? 'day-col day-col--weekend' : 'day-col'}
                style={{ backgroundSize: `100% ${HOUR_HEIGHT}px` }}
                onClick={createAt(date)}
              >
                {props.lanes.slice(1).map((lane, index) => (
                  <div key={lane.id} className="lane-rule" style={{ insetInlineStart: `${((index + 1) * 100) / props.lanes.length}%` }} />
                ))}
                {props.free
                  .filter((window) => window.date === date)
                  .map((window) => (
                    <div
                      key={window.start}
                      className="free-band"
                      style={{ top: top(window.start) + 2, height: ((window.end - window.start) / 60) * HOUR_HEIGHT - 4 }}
                    >
                      פנויים יחד {timeRange(window.start, window.end)}
                    </div>
                  ))}
                {layoutDay(dayItems, laneIds).map(renderBlock)}
                {date === props.today && now >= firstHour * 60 && now <= lastHour * 60 && (
                  <div className="now-line" style={{ top: top(now) }} aria-hidden="true" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
