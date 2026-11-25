import { useMutation } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { api, APP_NAME, type ConflictDto, type OccurrenceDto, type UserDto } from '../api.ts';
import { addDays, addMonths, fullDate, isDateStr, monthGrid, monthTitle, range, startOfWeek, today, weekTitle } from '../dates.ts';
import { useCalendar, useCategories, useRefreshAll, useShares, useUsers } from '../queries.ts';
import { navigate, useLocation } from '../router.ts';
import { useStored } from '../storage.ts';
import { Avatar, BrandMark, Icon, Segmented } from '../ui.tsx';
import { DaySummary } from './DaySummary.tsx';
import { EntryDrawer } from './EntryDrawer.tsx';
import { EntryForm, type FormTarget } from './EntryForm.tsx';
import type { View } from './model.ts';
import { MonthGrid } from './MonthGrid.tsx';
import { Sidebar } from './Sidebar.tsx';
import { TimeGrid } from './TimeGrid.tsx';

type Panel = { type: 'detail'; key: string } | { type: 'form'; target: FormTarget } | null;

const VIEWS: View[] = ['day', 'week', 'month'];
const EMPTY: never[] = [];

function toggled(list: number[], id: number): number[] {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
}

export function CalendarPage({ me }: { me: UserDto }) {
  const { params } = useLocation();
  const todayStr = today();
  const requestedView = params.get('view') as View | null;
  const view: View = requestedView && VIEWS.includes(requestedView) ? requestedView : window.innerWidth < 760 ? 'day' : 'week';
  const requestedDate = params.get('date');
  const date = isDateStr(requestedDate) ? requestedDate : todayStr;
  const go = (nextView: View, nextDate: string) => navigate(`/?view=${nextView}&date=${nextDate}`);

  const { from, to } = useMemo(() => {
    if (view === 'day') return { from: date, to: date };
    if (view === 'week') return { from: startOfWeek(date), to: addDays(startOfWeek(date), 6) };
    return monthGrid(date);
  }, [view, date]);
  const days = useMemo(() => range(from, to), [from, to]);

  const users = useUsers().data ?? EMPTY;
  const categories = useCategories().data ?? EMPTY;
  const shares = useShares().data;
  const calendar = useCalendar(from, to);
  const refresh = useRefreshAll();

  const [hiddenUsers, setHiddenUsers] = useStored<number[]>('tms.hiddenUsers', []);
  const [hiddenCategories, setHiddenCategories] = useStored<number[]>('tms.hiddenCategories', []);
  const [cross, setCross] = useStored('tms.cross', true);
  const [panel, setPanel] = useState<Panel>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPanel(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // The signed-in user's lane always comes first; others follow if they share anything.
  const others = users.filter((user) => user.id !== me.id);
  const lanes = [me, ...others.filter((user) => (shares?.received[user.id] ?? 'none') !== 'none')].filter(
    (user) => !hiddenUsers.includes(user.id),
  );
  const laneIds = lanes.map((lane) => lane.id);
  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const all = calendar.data?.occurrences ?? EMPTY;
  const byKey = useMemo(() => new Map(all.map((o) => [o.key, o])), [all]);
  const visible = all.filter(
    (o) => o.participantIds.some((id) => laneIds.includes(id)) && (o.categoryId === null || !hiddenCategories.includes(o.categoryId)),
  );

  const crossOn = cross && others.length > 0;
  const crossData = calendar.data?.cross;
  const conflicts = crossOn ? (crossData?.conflicts ?? EMPTY) : EMPTY;
  const conflictKeys = new Set(conflicts.flatMap((c) => [c.a, c.b]));
  const conflictDates = new Set(conflicts.map((c) => c.date));
  const free = crossOn ? (crossData?.free ?? EMPTY) : EMPTY;

  const toggleDone = useMutation({
    mutationFn: (o: OccurrenceDto) => api.put(`/api/entries/${o.entryId}/occurrences/${o.date}/done`, { done: !o.done }),
    onSuccess: refresh,
  });

  const title = view === 'day' ? fullDate(date) : view === 'week' ? weekTitle(from, to) : monthTitle(date);
  const shift = (direction: 1 | -1) =>
    go(view, view === 'month' ? addMonths(date, direction) : addDays(date, direction * (view === 'week' ? 7 : 1)));

  const openConflict = (conflict: ConflictDto) => {
    // Prefer the one-off of the pair: it is usually the one that can move.
    const a = byKey.get(conflict.a);
    const key = a && !a.recurring ? conflict.a : byKey.get(conflict.b)?.recurring === false ? conflict.b : conflict.a;
    go('day', conflict.date);
    setPanel({ type: 'detail', key });
    setFiltersOpen(false);
  };

  const selected = panel?.type === 'detail' ? byKey.get(panel.key) : undefined;
  const conflictsWith = selected
    ? conflicts
        .filter((c) => c.a === selected.key || c.b === selected.key)
        .map((c) => byKey.get(c.a === selected.key ? c.b : c.a))
        .filter((o): o is OccurrenceDto => o !== undefined)
    : EMPTY;

  const grid =
    view === 'month' ? (
      <MonthGrid days={days} anchor={date} occurrences={visible} categories={categoryMap} conflictDates={conflictDates} today={todayStr} onOpenDay={(day) => go('day', day)} />
    ) : (
      <TimeGrid
        view={view}
        days={days}
        occurrences={visible}
        lanes={lanes}
        users={users}
        categories={categoryMap}
        conflictKeys={conflictKeys}
        free={free}
        selectedKey={selected?.key ?? null}
        today={todayStr}
        onPick={(key) => setPanel({ type: 'detail', key })}
        onToggleDone={toggleDone.mutate}
        onOpenDay={(day) => go('day', day)}
        onCreate={(day, start) => setPanel({ type: 'form', target: { type: 'create', date: day, start } })}
      />
    );

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="/" onClick={(event) => (event.preventDefault(), go(view, todayStr))}>
          <BrandMark />
          <span className="brand__name">{APP_NAME}</span>
        </a>
        <div className="topbar__nav">
          <button type="button" className="button" onClick={() => go(view, todayStr)}>
            היום
          </button>
          <button type="button" className="button button--icon" aria-label="הקודם" onClick={() => shift(-1)}>
            <Icon name="prev" />
          </button>
          <button type="button" className="button button--icon" aria-label="הבא" onClick={() => shift(1)}>
            <Icon name="next" />
          </button>
          <h1 className="topbar__title">{title}</h1>
        </div>
        <div className="topbar__spacer" />
        <Segmented
          label="תצוגה"
          value={view}
          onChange={(next) => go(next, date)}
          options={[
            { value: 'day', label: 'יום' },
            { value: 'week', label: 'שבוע' },
            { value: 'month', label: 'חודש' },
          ]}
        />
        <button type="button" className="button button--icon filters-toggle" aria-label="סינון, לוחות והצלבה" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)}>
          <Icon name="filter" />
        </button>
        <a className="user-chip" href="/settings" onClick={(event) => (event.preventDefault(), navigate('/settings'))}>
          <Avatar user={me} filled />
          <span className="user-chip__text">
            <span className="user-chip__name">{me.displayName}</span>
            <span className="muted">הגדרות</span>
          </span>
        </a>
      </header>

      <div className="layout">
        <div className={filtersOpen ? 'layout__side layout__side--open' : 'layout__side'}>
          <Sidebar
            me={me}
            users={users}
            shares={shares}
            hiddenUsers={hiddenUsers}
            onToggleUser={(id) => setHiddenUsers(toggled(hiddenUsers, id))}
            cross={cross}
            onToggleCross={() => setCross(!cross)}
            scopeLabel={view === 'day' ? 'ביום המוצג' : view === 'week' ? 'בשבוע המוצג' : 'בטווח המוצג'}
            freeMinutes={free.reduce((sum, window) => sum + (window.end - window.start), 0)}
            conflicts={conflicts}
            load={crossData?.load ?? {}}
            byKey={byKey}
            onOpenConflict={openConflict}
            categories={categories}
            hiddenCategories={hiddenCategories}
            onToggleCategory={(id) => setHiddenCategories(toggled(hiddenCategories, id))}
            onSetCategories={(ids, hidden) =>
              setHiddenCategories(hidden ? [...new Set([...hiddenCategories, ...ids])] : hiddenCategories.filter((id) => !ids.includes(id)))
            }
            onNew={() => {
              setPanel({ type: 'form', target: { type: 'create', date, start: null } });
              setFiltersOpen(false);
            }}
          />
        </div>

        <main className="layout__main">
          <section className="board">
            {calendar.isError && <p className="note note--error">לא ניתן לטעון את הלוח. בדקו את החיבור לשרת.</p>}
            {grid}
            <div className="legend">
              <span><span className="legend__swatch legend__swatch--routine" />שגרה</span>
              <span><span className="legend__swatch legend__swatch--task" />משימה</span>
              {others.length > 0 && <span><span className="legend__swatch legend__swatch--busy" />תפוס (פרטי)</span>}
              {crossOn && <span><span className="legend__swatch legend__swatch--free" />פנויים יחד</span>}
              {crossOn && <span><span className="legend__swatch legend__swatch--conflict" />התנגשות</span>}
              {view !== 'month' && <span className="muted">לחיצה על שעה ריקה פותחת שיבוץ חדש</span>}
            </div>
          </section>
          {view === 'day' && (
            <DaySummary
              occurrences={visible}
              lanes={lanes}
              users={users}
              categories={categoryMap}
              onToggleDone={toggleDone.mutate}
              onPick={(key) => setPanel({ type: 'detail', key })}
            />
          )}
        </main>
      </div>

      <button type="button" className="fab" aria-label="שיבוץ חדש" onClick={() => setPanel({ type: 'form', target: { type: 'create', date, start: null } })}>
        <Icon name="plus" />
      </button>

      {selected && (
        <EntryDrawer
          key={selected.key}
          occurrence={selected}
          users={users}
          categories={categoryMap}
          conflictsWith={conflictsWith}
          onClose={() => setPanel(null)}
          onEdit={() => setPanel({ type: 'form', target: { type: 'edit', entryId: selected.entryId, occurrenceDate: selected.date } })}
        />
      )}
      {panel?.type === 'form' && (
        <EntryForm
          key={panel.target.type === 'edit' ? `edit-${panel.target.entryId}` : `new-${panel.target.date}-${panel.target.start}`}
          target={panel.target}
          me={me}
          users={users}
          categories={categories}
          shares={shares}
          onClose={() => setPanel(null)}
        />
      )}
    </div>
  );
}
