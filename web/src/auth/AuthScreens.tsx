import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent, type ReactNode } from 'react';
import { api, APP_NAME, errorMessage, type UserDto } from '../api.ts';
import { navigate } from '../router.ts';
import { BrandMark, ErrorNote, Field } from '../ui.tsx';

function AuthCard({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <main className="auth">
      <section className="auth__card">
        <header className="brand">
          <BrandMark size={34} />
          <span className="brand__name">{APP_NAME}</span>
        </header>
        <h1 className="auth__title">{title}</h1>
        {intro && <p className="auth__intro">{intro}</p>}
        {children}
      </section>
    </main>
  );
}

function useAuthMutation(url: string, after?: () => void) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, string>) => api.post<UserDto>(url, body),
    onSuccess: async () => {
      after?.();
      await client.invalidateQueries();
    },
  });
}

function CredentialsForm(props: {
  withDisplayName: boolean;
  submitLabel: string;
  pending: boolean;
  error: unknown;
  onSubmit: (values: Record<string, string>) => void;
}) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    props.onSubmit(props.withDisplayName ? { username, displayName, password } : { username, password });
  };

  return (
    <form className="form" onSubmit={submit}>
      {props.withDisplayName && (
        <Field label="השם שיוצג בלוח" htmlFor="auth-display">
          <input id="auth-display" className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="name" required maxLength={40} />
        </Field>
      )}
      <Field label="שם משתמש" htmlFor="auth-username">
        <input id="auth-username" className="input" dir="ltr" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" required />
      </Field>
      <Field label={props.withDisplayName ? 'סיסמה (8 תווים לפחות)' : 'סיסמה'} htmlFor="auth-password">
        <input id="auth-password" className="input" dir="ltr" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={props.withDisplayName ? 'new-password' : 'current-password'} required />
      </Field>
      <ErrorNote message={props.error ? errorMessage(props.error) : null} />
      <button className="button button--primary button--block" type="submit" disabled={props.pending}>
        {props.submitLabel}
      </button>
    </form>
  );
}

export function SetupScreen() {
  const mutation = useAuthMutation('/api/setup');
  return (
    <AuthCard title="הגדרה ראשונית" intro="יוצרים את החשבון הראשון. החשבון הזה מנהל את המערכת ויכול להזמין את שאר בני הבית.">
      <CredentialsForm withDisplayName submitLabel="יצירת חשבון" pending={mutation.isPending} error={mutation.error} onSubmit={mutation.mutate} />
    </AuthCard>
  );
}

export function LoginScreen() {
  const mutation = useAuthMutation('/api/auth/login');
  return (
    <AuthCard title="התחברות">
      <CredentialsForm withDisplayName={false} submitLabel="כניסה" pending={mutation.isPending} error={mutation.error} onSubmit={mutation.mutate} />
    </AuthCard>
  );
}

export function JoinScreen({ token }: { token: string }) {
  const invite = useQuery({
    queryKey: ['invite', token],
    queryFn: () => api.get<{ valid: boolean }>(`/api/invites/${encodeURIComponent(token)}`),
  });
  const mutation = useAuthMutation(`/api/invites/${encodeURIComponent(token)}/accept`, () => navigate('/', true));

  if (invite.isPending) return <AuthCard title="הצטרפות">{null}</AuthCard>;
  if (!invite.data?.valid) {
    return (
      <AuthCard title="ההזמנה אינה תקפה" intro="ייתכן שפג תוקפה או שכבר נעשה בה שימוש. בקשו ממנהל/ת המערכת קישור חדש.">
        <button className="button button--block" type="button" onClick={() => navigate('/', true)}>
          למסך ההתחברות
        </button>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="הצטרפות ללוח המשפחתי" intro="בוחרים שם משתמש וסיסמה. אחרי ההצטרפות תראו את הלוחות של בני הבית, והם את שלכם; אפשר לשנות זאת בהגדרות.">
      <CredentialsForm withDisplayName submitLabel="הצטרפות" pending={mutation.isPending} error={mutation.error} onSubmit={mutation.mutate} />
    </AuthCard>
  );
}
