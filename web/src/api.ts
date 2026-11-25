export type * from '../../server/src/shared/types.ts';
export { APP_NAME, COLOR_KEYS, MINUTES_PER_DAY } from '../../server/src/shared/types.ts';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

/** Fired when a request finds the session gone, so the app can fall back to the login screen. */
export const UNAUTHORIZED_EVENT = 'tms:unauthorized';

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? { accept: 'application/json' } : { accept: 'application/json', 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'network');
  }
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && !url.startsWith('/api/auth/')) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    const code = (data as { error?: string } | null)?.error ?? 'unknown';
    throw new ApiError(response.status, code);
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => call<T>('GET', url),
  post: <T>(url: string, body?: unknown) => call<T>('POST', url, body),
  put: <T>(url: string, body?: unknown) => call<T>('PUT', url, body),
  patch: <T>(url: string, body?: unknown) => call<T>('PATCH', url, body),
  del: <T>(url: string) => call<T>('DELETE', url),
};

const MESSAGES: Record<string, string> = {
  network: 'אין חיבור לשרת. בדקו את הרשת ונסו שוב.',
  bad_credentials: 'שם המשתמש או הסיסמה שגויים.',
  too_many_attempts: 'יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.',
  weak_password: 'הסיסמה צריכה להיות באורך 8 תווים לפחות.',
  invalid_username: 'שם משתמש: 2 עד 32 תווים – אותיות, ספרות, נקודה, מקף או קו תחתון.',
  invalid_display_name: 'צריך להזין שם תצוגה.',
  username_taken: 'שם המשתמש הזה כבר תפוס.',
  invalid_invite: 'קישור ההזמנה אינו תקף או שכבר נעשה בו שימוש.',
  already_set_up: 'המערכת כבר הוגדרה. אפשר להתחבר.',
  invalid_title: 'צריך לתת שם לשיבוץ.',
  invalid_time: 'שעת הסיום צריכה להיות אחרי שעת ההתחלה.',
  invalid_days: 'בחרו לפחות יום אחד.',
  invalid_date: 'התאריך אינו תקין, או שתאריך הסיום קודם לתאריך ההתחלה.',
  invalid_category: 'בחרו קטגוריה.',
  invalid_name: 'צריך להזין שם (עד 30 תווים).',
  forbidden_participant: 'כדי לשבץ בלוח של מישהו אחר צריך ממנו הרשאת עריכה.',
  forbidden: 'אין לך הרשאה לפעולה הזו.',
  not_found: 'הפריט לא נמצא. ייתכן שנמחק בינתיים.',
  unauthorized: 'צריך להתחבר מחדש.',
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return MESSAGES[error.code] ?? 'הפעולה נכשלה. נסו שוב.';
  return 'הפעולה נכשלה. נסו שוב.';
}
