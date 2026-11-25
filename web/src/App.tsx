import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { UNAUTHORIZED_EVENT } from './api.ts';
import { JoinScreen, LoginScreen, SetupScreen } from './auth/AuthScreens.tsx';
import { CalendarPage } from './calendar/CalendarPage.tsx';
import { useSession } from './queries.ts';
import { useLocation } from './router.ts';
import { SettingsPage } from './settings/SettingsPage.tsx';

export function App() {
  const session = useSession();
  const client = useQueryClient();
  const { path } = useLocation();

  useEffect(() => {
    const onUnauthorized = () => void client.invalidateQueries({ queryKey: ['session'] });
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [client]);

  if (session.isPending) return <p className="splash">טוען…</p>;
  if (session.isError) {
    return (
      <div className="splash">
        <p>אין חיבור לשרת.</p>
        <button className="button" type="button" onClick={() => void session.refetch()}>
          ניסיון חוזר
        </button>
      </div>
    );
  }

  const { setupRequired, user } = session.data;
  if (setupRequired) return <SetupScreen />;
  if (!user) {
    const join = /^\/join\/([^/]+)$/.exec(path);
    return join ? <JoinScreen token={decodeURIComponent(join[1]!)} /> : <LoginScreen />;
  }
  if (path === '/settings') return <SettingsPage me={user} />;
  return <CalendarPage me={user} />;
}
