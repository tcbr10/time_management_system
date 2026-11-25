import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent, type ReactNode } from 'react';
import {
  api,
  APP_NAME,
  COLOR_KEYS,
  errorMessage,
  type BackupDto,
  type CategoryDto,
  type ColorKey,
  type HouseholdSettingsDto,
  type InviteDto,
  type Kind,
  type ShareLevel,
  type UserDto,
} from '../api.ts';
import { hm, parseHm } from '../dates.ts';
import { PALETTE } from '../palette.ts';
import { useCategories, useHouseholdSettings, useRefreshAll, useShares, useUsers } from '../queries.ts';
import { navigate } from '../router.ts';
import { Avatar, BrandMark, ErrorNote, Field, Icon } from '../ui.tsx';

function Section({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <section className="card settings-section">
      <h2 className="settings-section__title">{title}</h2>
      {intro && <p className="muted">{intro}</p>}
      {children}
    </section>
  );
}

function ColorSelect({ value, label, onChange }: { value: ColorKey; label: string; onChange: (color: ColorKey) => void }) {
  return (
    <span className="color-select">
      <span className="dot dot--large" style={{ background: PALETTE[value].bd }} />
      <select className="input input--compact" aria-label={label} value={value} onChange={(e) => onChange(e.target.value as ColorKey)}>
        {COLOR_KEYS.map((key) => (
          <option key={key} value={key}>
            {PALETTE[key].label}
          </option>
        ))}
      </select>
    </span>
  );
}

function CategoryRow({ category }: { category: CategoryDto }) {
  const refresh = useRefreshAll();
  const [name, setName] = useState(category.name);
  const patch = useMutation({
    mutationFn: (body: Partial<CategoryDto>) => api.patch<CategoryDto>(`/api/categories/${category.id}`, body),
    onSuccess: refresh,
  });
  const saveName = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== category.name) patch.mutate({ name: trimmed });
    else setName(category.name);
  };
  return (
    <li className={category.archived ? 'category-row category-row--archived' : 'category-row'}>
      <ColorSelect value={category.color} label={`צבע של ${category.name}`} onChange={(color) => patch.mutate({ color })} />
      <input className="input input--compact category-row__name" aria-label="שם הקטגוריה" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} onBlur={saveName} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
      <label className="inline-check">
        <input type="checkbox" checked={category.isChore} onChange={(e) => patch.mutate({ isChore: e.target.checked })} />
        מטלת בית
      </label>
      <button type="button" className="link-button" onClick={() => patch.mutate({ archived: !category.archived })}>
        {category.archived ? 'שחזור' : 'העברה לארכיון'}
      </button>
    </li>
  );
}

function CategoryList({ kind, title, categories }: { kind: Kind; title: string; categories: CategoryDto[] }) {
  const refresh = useRefreshAll();
  const [name, setName] = useState('');
  const [color, setColor] = useState<ColorKey>('teal');
  const create = useMutation({
    mutationFn: () => api.post<CategoryDto>('/api/categories', { kind, name, color, isChore: false }),
    onSuccess: () => {
      setName('');
      refresh();
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim()) create.mutate();
  };
  return (
    <div className="category-list">
      <h3 className="card__title">{title}</h3>
      <ul>
        {categories.filter((c) => c.kind === kind).map((category) => (
          <CategoryRow key={category.id} category={category} />
        ))}
      </ul>
      <form className="category-row category-row--new" onSubmit={submit}>
        <ColorSelect value={color} label="צבע לקטגוריה חדשה" onChange={setColor} />
        <input className="input input--compact category-row__name" aria-label={`שם קטגוריה חדשה – ${title}`} placeholder="קטגוריה חדשה" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />
        <button type="submit" className="button" disabled={create.isPending || !name.trim()}>
          הוספה
        </button>
      </form>
      <ErrorNote message={create.error ? errorMessage(create.error) : null} />
    </div>
  );
}

const LEVEL_LABELS: Record<ShareLevel, string> = {
  none: 'כלום',
  busy: 'תפוס בלבד',
  view: 'צפייה בפרטים',
  edit: 'צפייה ועריכה',
};

function SharingSection({ me, users }: { me: UserDto; users: UserDto[] }) {
  const refresh = useRefreshAll();
  const shares = useShares().data;
  const update = useMutation({
    mutationFn: ({ userId, level }: { userId: number; level: ShareLevel }) => api.put(`/api/shares/${userId}`, { level }),
    onSuccess: refresh,
  });
  const others = users.filter((user) => user.id !== me.id);
  return (
    <Section title="שיתוף" intro="מה כל אחד מבני הבית רואה מהלוח שלי. שיבוץ שסומן פרטי מוצג תמיד כ״תפוס״ בלבד.">
      {others.length === 0 && <p className="muted">עדיין אין משתמשים נוספים. מנהל/ת המערכת יכול/ה להזמין אותם למטה.</p>}
      {others.map((user) => (
        <div key={user.id} className="share-row">
          <Avatar user={user} filled={false} />
          <span className="share-row__text">
            <strong>{user.displayName}</strong>
            <span className="muted">משתף/ת איתי: {LEVEL_LABELS[shares?.received[user.id] ?? 'none']}</span>
          </span>
          <select className="input input--compact" aria-label={`מה ${user.displayName} רואה מהלוח שלי`} value={shares?.granted[user.id] ?? 'none'} onChange={(e) => update.mutate({ userId: user.id, level: e.target.value as ShareLevel })}>
            {(Object.keys(LEVEL_LABELS) as ShareLevel[]).map((level) => (
              <option key={level} value={level}>
                רואה ממני: {LEVEL_LABELS[level]}
              </option>
            ))}
          </select>
        </div>
      ))}
      <ErrorNote message={update.error ? errorMessage(update.error) : null} />
    </Section>
  );
}

function MembersSection({ me, users }: { me: UserDto; users: UserDto[] }) {
  const client = useQueryClient();
  const invites = useQuery({ queryKey: ['invites'], queryFn: () => api.get<InviteDto[]>('/api/invites') });
  const refreshInvites = () => client.invalidateQueries({ queryKey: ['invites'] });
  const create = useMutation({ mutationFn: () => api.post<InviteDto>('/api/invites'), onSuccess: refreshInvites });
  const revoke = useMutation({ mutationFn: (token: string) => api.del(`/api/invites/${encodeURIComponent(token)}`), onSuccess: refreshInvites });
  const [resetFor, setResetFor] = useState<number | null>(null);
  const [password, setPassword] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const reset = useMutation({
    mutationFn: () => api.post(`/api/users/${resetFor}/password`, { password }),
    onSuccess: () => {
      setResetFor(null);
      setPassword('');
    },
  });
  const link = (token: string) => `${window.location.origin}/join/${token}`;
  const copy = (token: string) => {
    void navigator.clipboard?.writeText(link(token)).then(() => setCopied(token));
  };

  return (
    <Section title="בני הבית" intro="משתמש חדש מצטרף דרך קישור הזמנה חד־פעמי, שתקף לשבוע.">
      <ul className="plain-list">
        {users.map((user) => (
          <li key={user.id} className="share-row">
            <Avatar user={user} filled={user.id === me.id} />
            <span className="share-row__text">
              <strong>{user.displayName}</strong>
              <span className="muted" dir="ltr">
                {user.username}
                {user.role === 'admin' ? ' · admin' : ''}
              </span>
            </span>
            {user.id !== me.id && (
              <button type="button" className="link-button" onClick={() => setResetFor(resetFor === user.id ? null : user.id)}>
                איפוס סיסמה
              </button>
            )}
          </li>
        ))}
      </ul>
      {resetFor !== null && (
        <form className="inline-form" onSubmit={(event) => (event.preventDefault(), reset.mutate())}>
          <Field label={`סיסמה חדשה עבור ${users.find((u) => u.id === resetFor)?.displayName ?? ''}`} htmlFor="reset-password">
            <input id="reset-password" className="input" dir="ltr" type="text" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <button type="submit" className="button" disabled={reset.isPending}>
            שמירה
          </button>
        </form>
      )}
      <ErrorNote message={reset.error ? errorMessage(reset.error) : null} />

      <button type="button" className="button" disabled={create.isPending} onClick={() => create.mutate()}>
        <Icon name="plus" />
        יצירת קישור הזמנה
      </button>
      {(invites.data ?? []).map((invite) => (
        <div key={invite.token} className="invite">
          <input className="input input--compact" dir="ltr" readOnly aria-label="קישור הזמנה" value={link(invite.token)} onFocus={(e) => e.currentTarget.select()} />
          <button type="button" className="button" onClick={() => copy(invite.token)}>
            {copied === invite.token ? 'הועתק' : 'העתקה'}
          </button>
          <button type="button" className="link-button" onClick={() => revoke.mutate(invite.token)}>
            ביטול
          </button>
        </div>
      ))}
    </Section>
  );
}

function ActiveHoursSection({ settings }: { settings: HouseholdSettingsDto }) {
  const refresh = useRefreshAll();
  const [from, setFrom] = useState(hm(settings.activeFrom));
  const [to, setTo] = useState(hm(settings.activeTo));
  const save = useMutation({
    mutationFn: () => api.put('/api/settings', { activeFrom: parseHm(from), activeTo: parseHm(to) }),
    onSuccess: refresh,
  });
  return (
    <Section title="שעות פעילות" intro="״פנויים יחד״ מחושב רק בתוך השעות האלה, כדי ששעות השינה לא ייספרו כזמן פנוי.">
      <form className="inline-form" onSubmit={(event) => (event.preventDefault(), save.mutate())}>
        <Field label="מ־" htmlFor="active-from">
          <input id="active-from" className="input" type="time" required value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="עד" htmlFor="active-to">
          <input id="active-to" className="input" type="time" required value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <button type="submit" className="button" disabled={save.isPending}>
          שמירה
        </button>
      </form>
      {save.isSuccess && <p className="muted" role="status">נשמר.</p>}
      <ErrorNote message={save.error ? errorMessage(save.error) : null} />
    </Section>
  );
}

function BackupSection() {
  const client = useQueryClient();
  const backups = useQuery({ queryKey: ['backups'], queryFn: () => api.get<BackupDto[]>('/api/admin/backups') });
  const run = useMutation({
    mutationFn: () => api.post<BackupDto>('/api/admin/backups'),
    onSuccess: () => client.invalidateQueries({ queryKey: ['backups'] }),
  });
  const list = backups.data ?? [];
  return (
    <Section title="גיבוי" intro="עותק של מסד הנתונים נשמר אוטומטית פעם ביום בתיקיית הנתונים של הקונטיינר, ונשמרים 14 הימים האחרונים. כדאי להעתיק מדי פעם גם עותק אל מחוץ לשרת.">
      <div className="inline-form">
        <button type="button" className="button" disabled={run.isPending} onClick={() => run.mutate()}>
          גיבוי עכשיו
        </button>
        <a className="button" href="/api/admin/export" download>
          הורדת כל הנתונים (JSON)
        </a>
      </div>
      <ErrorNote message={run.error ? errorMessage(run.error) : null} />
      {list.length === 0 ? (
        <p className="muted">עדיין אין גיבויים.</p>
      ) : (
        <ul className="plain-list backup-list">
          {list.map((backup) => (
            <li key={backup.name}>
              <span dir="ltr">{backup.name}</span>
              <span className="muted">{Math.max(1, Math.round(backup.size / 1024))} KB</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function AccountSection() {
  const client = useQueryClient();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const change = useMutation({
    mutationFn: () => api.post('/api/auth/password', { current, next }),
    onSuccess: () => {
      setCurrent('');
      setNext('');
    },
  });
  const logout = useMutation({
    mutationFn: () => api.post('/api/auth/logout'),
    onSuccess: () => {
      navigate('/', true);
      client.clear();
      void client.invalidateQueries();
    },
  });
  return (
    <Section title="החשבון שלי">
      <form className="inline-form" onSubmit={(event) => (event.preventDefault(), change.mutate())}>
        <Field label="סיסמה נוכחית" htmlFor="password-current">
          <input id="password-current" className="input" dir="ltr" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="סיסמה חדשה" htmlFor="password-next">
          <input id="password-next" className="input" dir="ltr" type="password" autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <button type="submit" className="button" disabled={change.isPending}>
          החלפת סיסמה
        </button>
      </form>
      {change.isSuccess && <p className="muted" role="status">הסיסמה הוחלפה. מכשירים אחרים נותקו.</p>}
      <ErrorNote message={change.error ? errorMessage(change.error) : null} />
      <div>
        <button type="button" className="button button--danger" disabled={logout.isPending} onClick={() => logout.mutate()}>
          התנתקות
        </button>
      </div>
    </Section>
  );
}

export function SettingsPage({ me }: { me: UserDto }) {
  const users = useUsers().data ?? [];
  const categories = useCategories().data ?? [];
  const household = useHouseholdSettings().data;
  const isAdmin = me.role === 'admin';
  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="/" onClick={(event) => (event.preventDefault(), navigate('/'))}>
          <BrandMark />
          <span className="brand__name">{APP_NAME}</span>
        </a>
        <h1 className="topbar__title">הגדרות</h1>
        <div className="topbar__spacer" />
        <button type="button" className="button" onClick={() => navigate('/')}>
          <Icon name="back" />
          חזרה ללוח
        </button>
      </header>
      <main className="settings">
        <Section title="קטגוריות" intro="הקטגוריות משותפות לכל בני הבית. ״מטלת בית״ קובע אם הקטגוריה נספרת בחלוקת המטלות שבהצלבה.">
          <CategoryList kind="routine" title="שגרות" categories={categories} />
          <CategoryList kind="task" title="משימות" categories={categories} />
        </Section>
        <SharingSection me={me} users={users} />
        {isAdmin && <MembersSection me={me} users={users} />}
        {isAdmin && household && <ActiveHoursSection settings={household} />}
        {isAdmin && <BackupSection />}
        <AccountSection />
      </main>
    </div>
  );
}
