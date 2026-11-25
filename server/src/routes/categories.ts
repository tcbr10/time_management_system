import { eq, max } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Ctx } from '../context.js';
import { categories } from '../db/schema.js';
import { bodyObject, HttpError, idParam, requireUser, str } from '../http.js';
import { COLOR_KEYS, KINDS, type CategoryDto, type ColorKey, type Kind } from '../shared/types.js';

function parseColor(value: unknown): ColorKey {
  if (!COLOR_KEYS.includes(value as ColorKey)) throw new HttpError(400, 'invalid_color');
  return value as ColorKey;
}

function toDto(row: typeof categories.$inferSelect): CategoryDto {
  return { ...row, color: row.color as ColorKey };
}

export function registerCategoryRoutes(app: FastifyInstance, ctx: Ctx): void {
  const { db } = ctx;

  app.get('/api/categories', async (request): Promise<CategoryDto[]> => {
    requireUser(request);
    return db.select().from(categories).orderBy(categories.sort, categories.id).all().map(toDto);
  });

  app.post('/api/categories', async (request): Promise<CategoryDto> => {
    requireUser(request);
    const body = bodyObject(request);
    if (!KINDS.includes(body.kind as Kind)) throw new HttpError(400, 'invalid_kind');
    const last = db.select({ sort: max(categories.sort) }).from(categories).get()?.sort ?? -1;
    const row = db
      .insert(categories)
      .values({
        kind: body.kind as Kind,
        name: str(body.name, 1, 30, 'invalid_name'),
        color: parseColor(body.color),
        isChore: body.isChore === true,
        sort: last + 1,
      })
      .returning()
      .get();
    ctx.changed();
    return toDto(row);
  });

  // The kind of a category never changes: entries of the other kind would be left behind.
  app.patch('/api/categories/:id', async (request): Promise<CategoryDto> => {
    requireUser(request);
    const id = idParam(request);
    const body = bodyObject(request);
    const patch: Partial<typeof categories.$inferInsert> = {};
    if (body.name !== undefined) patch.name = str(body.name, 1, 30, 'invalid_name');
    if (body.color !== undefined) patch.color = parseColor(body.color);
    if (body.isChore !== undefined) patch.isChore = body.isChore === true;
    if (body.archived !== undefined) patch.archived = body.archived === true;
    if (Object.keys(patch).length === 0) throw new HttpError(400, 'invalid_request');
    const row = db.update(categories).set(patch).where(eq(categories.id, id)).returning().get();
    if (!row) throw new HttpError(404, 'not_found');
    ctx.changed();
    return toDto(row);
  });
}
