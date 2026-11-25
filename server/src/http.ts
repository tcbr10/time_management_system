import type { FastifyRequest } from 'fastify';
import type { users } from './db/schema.js';

export type UserRow = typeof users.$inferSelect;

declare module 'fastify' {
  interface FastifyRequest {
    user: UserRow | null;
  }
}

/** Thrown from route handlers; the app's error handler turns it into `{ error: code }`. */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
  ) {
    super(code);
  }
}

export function requireUser(request: FastifyRequest): UserRow {
  if (!request.user) throw new HttpError(401, 'unauthorized');
  return request.user;
}

export function requireAdmin(request: FastifyRequest): UserRow {
  const user = requireUser(request);
  if (user.role !== 'admin') throw new HttpError(403, 'forbidden');
  return user;
}

export function bodyObject(request: FastifyRequest): Record<string, unknown> {
  const body = request.body;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(400, 'invalid_request');
  }
  return body as Record<string, unknown>;
}

export function idParam(request: FastifyRequest, name = 'id'): number {
  const raw = (request.params as Record<string, string>)[name];
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, 'not_found');
  return id;
}

export function str(value: unknown, min: number, max: number, code: string): string {
  if (typeof value !== 'string') throw new HttpError(400, code);
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) throw new HttpError(400, code);
  return trimmed;
}

export function int(value: unknown, min: number, max: number, code: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new HttpError(400, code);
  }
  return value;
}
