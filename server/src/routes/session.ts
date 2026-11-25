import { count, eq, gt, ne } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  AttemptLimiter,
  endSession,
  hashPassword,
  newToken,
  startSession,
  toUserDto,
  verifyPassword,
} from '../auth.js';
import type { Ctx } from '../context.js';
import { categories, invites, sessions, shares, users } from '../db/schema.js';
import { bodyObject, HttpError, idParam, requireAdmin, requireUser, str } from '../http.js';
import type { CategoryInput, InviteDto, SessionDto, UserDto } from '../shared/types.js';

const USERNAME_RE = /^[\p{L}\p{N}._-]{2,32}$/u;
const INVITE_DAYS = 7;

const DEFAULT_CATEGORIES: CategoryInput[] = [
  { kind: 'routine', name: 'אוכל', color: 'orange', isChore: false },
  { kind: 'routine', name: 'מקלחות', color: 'cyan', isChore: true },
  { kind: 'routine', name: 'הרדמות', color: 'violet', isChore: true },
  { kind: 'routine', name: 'סידור', color: 'green', isChore: true },
  { kind: 'routine', name: 'נקיון', color: 'lime', isChore: true },
  { kind: 'routine', name: 'עבודה', color: 'slate', isChore: false },
  { kind: 'routine', name: 'זמן אישי', color: 'pink', isChore: false },
  { kind: 'task', name: 'בית ותחזוקה', color: 'brown', isChore: true },
  { kind: 'task', name: 'סידורים וקניות', color: 'gold', isChore: true },
  { kind: 'task', name: 'ילדים', color: 'coral', isChore: true },
  { kind: 'task', name: 'בריאות', color: 'blue', isChore: false },
];

interface Credentials {
  username: string;
  displayName: string;
  password: string;
}

function parseUsername(value: unknown): string {
  const username = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!USERNAME_RE.test(username)) throw new HttpError(400, 'invalid_username');
  return username;
}

function parsePassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < 8 || value.length > 200) {
    throw new HttpError(400, 'weak_password');
  }
  return value;
}

function parseCredentials(body: Record<string, unknown>): Credentials {
  return {
    username: parseUsername(body.username),
    displayName: str(body.displayName, 1, 40, 'invalid_display_name'),
    password: parsePassword(body.password),
  };
}

export function registerSessionRoutes(app: FastifyInstance, ctx: Ctx): void {
  const { db } = ctx;
  const limiter = new AttemptLimiter(10, 10 * 60_000);

  const userCount = () => db.select({ n: count() }).from(users).get()!.n;

  app.get('/api/session', async (request): Promise<SessionDto> => {
    return {
      setupRequired: userCount() === 0,
      user: request.user ? toUserDto(request.user) : null,
    };
  });

  // First run: creates the admin account and the default categories.
  app.post('/api/setup', async (request, reply): Promise<UserDto> => {
    const credentials = parseCredentials(bodyObject(request));
    if (userCount() > 0) throw new HttpError(409, 'already_set_up');
    const passwordHash = await hashPassword(credentials.password);
    const user = db.transaction((tx) => {
      if (tx.select({ n: count() }).from(users).get()!.n > 0) throw new HttpError(409, 'already_set_up');
      tx.insert(categories)
        .values(DEFAULT_CATEGORIES.map((category, index) => ({ ...category, sort: index })))
        .run();
      return tx
        .insert(users)
        .values({
          username: credentials.username,
          displayName: credentials.displayName,
          passwordHash,
          role: 'admin',
          createdAt: Date.now(),
        })
        .returning()
        .get();
    });
    startSession(ctx, request, reply, user.id);
    return toUserDto(user);
  });

  app.post('/api/auth/login', async (request, reply): Promise<UserDto> => {
    const body = bodyObject(request);
    if (!limiter.allowed(request.ip)) throw new HttpError(429, 'too_many_attempts');
    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const user = db.select().from(users).where(eq(users.username, username)).get();
    // Hash even for an unknown user so response time does not reveal which usernames exist.
    const ok = user
      ? await verifyPassword(password, user.passwordHash)
      : (await hashPassword(password), false);
    if (!user || !ok) throw new HttpError(401, 'bad_credentials');
    limiter.reset(request.ip);
    startSession(ctx, request, reply, user.id);
    return toUserDto(user);
  });

  app.post('/api/auth/logout', async (request, reply) => {
    endSession(ctx, request, reply);
    return { ok: true };
  });

  app.post('/api/auth/password', async (request, reply) => {
    const user = requireUser(request);
    const body = bodyObject(request);
    if (!limiter.allowed(request.ip)) throw new HttpError(429, 'too_many_attempts');
    const current = typeof body.current === 'string' ? body.current : '';
    if (!(await verifyPassword(current, user.passwordHash))) throw new HttpError(401, 'bad_credentials');
    const passwordHash = await hashPassword(parsePassword(body.next));
    db.update(users).set({ passwordHash }).where(eq(users.id, user.id)).run();
    // Sign out everywhere, then back in here.
    db.delete(sessions).where(eq(sessions.userId, user.id)).run();
    startSession(ctx, request, reply, user.id);
    return { ok: true };
  });

  app.get('/api/users', async (request): Promise<UserDto[]> => {
    requireUser(request);
    return db.select().from(users).orderBy(users.id).all().map(toUserDto);
  });

  // An admin can set a new password for a family member who forgot theirs.
  app.post('/api/users/:id/password', async (request) => {
    requireAdmin(request);
    const id = idParam(request);
    const passwordHash = await hashPassword(parsePassword(bodyObject(request).password));
    const result = db.update(users).set({ passwordHash }).where(eq(users.id, id)).run();
    if (result.changes === 0) throw new HttpError(404, 'not_found');
    db.delete(sessions).where(eq(sessions.userId, id)).run();
    return { ok: true };
  });

  app.get('/api/invites', async (request): Promise<InviteDto[]> => {
    requireAdmin(request);
    return db.select().from(invites).where(gt(invites.expiresAt, Date.now())).all();
  });

  app.post('/api/invites', async (request): Promise<InviteDto> => {
    const admin = requireAdmin(request);
    const invite = { token: newToken(), expiresAt: Date.now() + INVITE_DAYS * 86_400_000 };
    db.insert(invites).values({ ...invite, createdBy: admin.id }).run();
    return invite;
  });

  app.delete('/api/invites/:token', async (request) => {
    requireAdmin(request);
    const { token } = request.params as { token: string };
    db.delete(invites).where(eq(invites.token, token)).run();
    return { ok: true };
  });

  app.get('/api/invites/:token', async (request) => {
    const { token } = request.params as { token: string };
    const invite = db.select().from(invites).where(eq(invites.token, token)).get();
    return { valid: !!invite && invite.expiresAt > Date.now() };
  });

  // Joining through an invite link. New members and existing ones see each other's
  // calendars by default; either side can narrow that in the sharing settings.
  app.post('/api/invites/:token/accept', async (request, reply): Promise<UserDto> => {
    const { token } = request.params as { token: string };
    const credentials = parseCredentials(bodyObject(request));
    const passwordHash = await hashPassword(credentials.password);
    const user = db.transaction((tx) => {
      const invite = tx.select().from(invites).where(eq(invites.token, token)).get();
      if (!invite || invite.expiresAt <= Date.now()) throw new HttpError(404, 'invalid_invite');
      if (tx.select().from(users).where(eq(users.username, credentials.username)).get()) {
        throw new HttpError(409, 'username_taken');
      }
      const created = tx
        .insert(users)
        .values({
          username: credentials.username,
          displayName: credentials.displayName,
          passwordHash,
          role: 'member',
          createdAt: Date.now(),
        })
        .returning()
        .get();
      const others = tx.select({ id: users.id }).from(users).where(ne(users.id, created.id)).all();
      for (const other of others) {
        tx.insert(shares)
          .values([
            { ownerId: created.id, granteeId: other.id, level: 'view' },
            { ownerId: other.id, granteeId: created.id, level: 'view' },
          ])
          .run();
      }
      tx.delete(invites).where(eq(invites.token, token)).run();
      return created;
    });
    startSession(ctx, request, reply, user.id);
    ctx.changed();
    return toUserDto(user);
  });
}
