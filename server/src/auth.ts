import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { eq, lt } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Ctx } from './context.js';
import { sessions, users } from './db/schema.js';
import type { UserRow } from './http.js';
import type { UserDto } from './shared/types.js';

const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };
const KEY_LENGTH = 32;
const SESSION_COOKIE = 'sid';
const SESSION_DAYS = 180;

function derive(password: string, salt: Buffer, params: typeof SCRYPT): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, params, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

/** Format: scrypt$N$r$p$salt$hash (base64url), so parameters can be raised later. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64url'), key.toString('base64url')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const actual = await derive(password, Buffer.from(salt, 'base64url'), {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

function sessionId(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function toUserDto(user: UserRow): UserDto {
  return { id: user.id, username: user.username, displayName: user.displayName, role: user.role };
}

export function startSession(ctx: Ctx, request: FastifyRequest, reply: FastifyReply, userId: number): void {
  const token = newToken();
  const maxAge = SESSION_DAYS * 86_400;
  ctx.db
    .insert(sessions)
    .values({ id: sessionId(token), userId, expiresAt: Date.now() + maxAge * 1000 })
    .run();
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    // The app is usually reached over plain HTTP on the home network.
    secure: request.protocol === 'https',
    maxAge,
  });
}

export function endSession(ctx: Ctx, request: FastifyRequest, reply: FastifyReply): void {
  const token = request.cookies[SESSION_COOKIE];
  if (token) ctx.db.delete(sessions).where(eq(sessions.id, sessionId(token))).run();
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

/** Resolves the session cookie to a user row, or null. */
export function userFromRequest(ctx: Ctx, request: FastifyRequest): UserRow | null {
  const token = request.cookies[SESSION_COOKIE];
  if (!token) return null;
  const row = ctx.db
    .select({ user: users, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, sessionId(token)))
    .get();
  if (!row || row.expiresAt < Date.now()) return null;
  return row.user;
}

export function purgeExpiredSessions(ctx: Ctx): void {
  ctx.db.delete(sessions).where(lt(sessions.expiresAt, Date.now())).run();
}

/** Small in-memory limiter for password attempts, keyed by client address. */
export class AttemptLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  allowed(key: string): boolean {
    const now = Date.now();
    const hit = this.hits.get(key);
    if (!hit || hit.resetAt < now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    hit.count += 1;
    return hit.count <= this.max;
  }

  reset(key: string): void {
    this.hits.delete(key);
  }
}
