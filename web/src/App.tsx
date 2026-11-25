import { useEffect, useState } from 'react';
import { fetchHealth, type Health } from './api.ts';

const REFRESH_MS = 15_000;

type State =
  | { kind: 'loading' }
  | { kind: 'loaded'; health: Health }
  | { kind: 'unreachable' };

function useHealth(): State {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    const load = () =>
      fetchHealth(controller.signal)
        .then((health) => setState({ kind: 'loaded', health }))
        .catch(() => {
          if (!controller.signal.aborted) setState({ kind: 'unreachable' });
        });
    void load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, []);

  return state;
}

function formatDateTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('he-IL', {
    timeZone,
    dateStyle: 'long',
    timeStyle: 'short',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

function formatUptime(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return `${days} ימים ו־${hours} שעות`;
  if (hours > 0) return `${hours} שעות ו־${minutes} דקות`;
  if (minutes > 0) return `${minutes} דקות`;
  return 'פחות מדקה';
}

function StatusBanner({ state }: { state: State }) {
  if (state.kind === 'loading') {
    return (
      <p className="banner banner--neutral" role="status">
        בודק את מצב המערכת…
      </p>
    );
  }
  if (state.kind === 'unreachable') {
    return (
      <p className="banner banner--error" role="alert">
        אין חיבור לשרת. הבדיקה תחזור על עצמה אוטומטית.
      </p>
    );
  }
  if (state.health.status !== 'ok') {
    return (
      <p className="banner banner--error" role="alert">
        השרת פועל, אבל מסד הנתונים אינו זמין.
      </p>
    );
  }
  return (
    <p className="banner banner--ok" role="status">
      המערכת פועלת
    </p>
  );
}

function Details({ health }: { health: Health }) {
  const rows: Array<[string, string]> = [
    ['גרסה', health.commit ? `${health.version} (${health.commit.slice(0, 7)})` : health.version],
    ['שעון השרת', formatDateTime(health.serverTime, health.timeZone)],
    ['אזור זמן', health.timeZone],
    ['מסד נתונים', health.database.ok ? 'תקין' : 'לא זמין'],
    ['נתונים נשמרים מאז', formatDateTime(health.database.installedAt, health.timeZone)],
    ['זמן פעילות', formatUptime(health.uptimeSeconds)],
  ];
  return (
    <dl className="details">
      {rows.map(([label, value]) => (
        <div className="details__row" key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function App() {
  const state = useHealth();
  return (
    <main className="page">
      <section className="card">
        <header className="brand">
          <svg aria-hidden="true" width="34" height="34" viewBox="0 0 30 30" fill="none">
            <rect x="2" y="2" width="26" height="26" rx="8" stroke="currentColor" strokeWidth="2.4" />
            <path
              d="M15 8.5V15l4.5 3"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <h1>סדר יום</h1>
        </header>
        <StatusBanner state={state} />
        {state.kind === 'loaded' && <Details health={state.health} />}
        <p className="note">
          זהו שלד המערכת (שלב 0). ההתחברות והלוח עצמו ייבנו בשלבים הבאים. אם ״נתונים נשמרים מאז״
          נשאר קבוע אחרי הפעלה מחדש של הקונטיינר, אחסון הנתונים מוגדר נכון.
        </p>
      </section>
    </main>
  );
}
