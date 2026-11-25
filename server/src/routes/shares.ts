import { and, eq, or } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Ctx } from '../context.js';
import { shares, users } from '../db/schema.js';
import { bodyObject, HttpError, idParam, int, requireAdmin, requireUser } from '../http.js';
import {
  MINUTES_PER_DAY,
  SHARE_LEVELS,
  type HouseholdSettingsDto,
  type ShareLevel,
  type SharesDto,
} from '../shared/types.js';
import { loadHouseholdSettings, saveHouseholdSettings } from '../store.js';

export function registerShareRoutes(app: FastifyInstance, ctx: Ctx): void {
  const { db } = ctx;

  app.get('/api/shares', async (request): Promise<SharesDto> => {
    const me = requireUser(request);
    const result: SharesDto = { granted: {}, received: {} };
    for (const user of db.select({ id: users.id }).from(users).all()) {
      if (user.id === me.id) continue;
      result.granted[user.id] = 'none';
      result.received[user.id] = 'none';
    }
    const rows = db
      .select()
      .from(shares)
      .where(or(eq(shares.ownerId, me.id), eq(shares.granteeId, me.id)))
      .all();
    for (const row of rows) {
      if (row.ownerId === me.id) result.granted[row.granteeId] = row.level;
      else result.received[row.ownerId] = row.level;
    }
    return result;
  });

  // Sets what another user may see of my calendar.
  app.put('/api/shares/:id', async (request) => {
    const me = requireUser(request);
    const granteeId = idParam(request);
    const level = bodyObject(request).level as ShareLevel;
    if (!SHARE_LEVELS.includes(level)) throw new HttpError(400, 'invalid_level');
    if (granteeId === me.id || !db.select().from(users).where(eq(users.id, granteeId)).get()) {
      throw new HttpError(404, 'not_found');
    }
    if (level === 'none') {
      db.delete(shares).where(and(eq(shares.ownerId, me.id), eq(shares.granteeId, granteeId))).run();
    } else {
      db.insert(shares)
        .values({ ownerId: me.id, granteeId, level })
        .onConflictDoUpdate({ target: [shares.ownerId, shares.granteeId], set: { level } })
        .run();
    }
    ctx.changed();
    return { ok: true };
  });

  app.get('/api/settings', async (request): Promise<HouseholdSettingsDto> => {
    requireUser(request);
    return loadHouseholdSettings(db);
  });

  app.put('/api/settings', async (request): Promise<HouseholdSettingsDto> => {
    requireAdmin(request);
    const body = bodyObject(request);
    const value: HouseholdSettingsDto = {
      activeFrom: int(body.activeFrom, 0, MINUTES_PER_DAY - 1, 'invalid_time'),
      activeTo: int(body.activeTo, 1, MINUTES_PER_DAY, 'invalid_time'),
    };
    if (value.activeTo <= value.activeFrom) throw new HttpError(400, 'invalid_time');
    saveHouseholdSettings(db, value);
    ctx.changed();
    return value;
  });
}
