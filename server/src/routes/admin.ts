import type { FastifyInstance } from 'fastify';
import { listBackups, localDate, runBackup } from '../backup.js';
import type { Ctx } from '../context.js';
import {
  categories,
  entries,
  entryExceptions,
  entryParticipants,
  shares,
  taskCompletions,
  users,
} from '../db/schema.js';
import { requireAdmin } from '../http.js';
import type { BackupDto } from '../shared/types.js';
import { loadHouseholdSettings } from '../store.js';

export function registerAdminRoutes(app: FastifyInstance, ctx: Ctx): void {
  const { db } = ctx;

  app.get('/api/admin/backups', async (request): Promise<BackupDto[]> => {
    requireAdmin(request);
    return listBackups(ctx);
  });

  app.post('/api/admin/backups', async (request): Promise<BackupDto> => {
    requireAdmin(request);
    return runBackup(ctx);
  });

  // Everything in the household as one JSON file. Passwords and sessions are left out.
  app.get('/api/admin/export', async (request, reply) => {
    requireAdmin(request);
    reply.header('content-disposition', `attachment; filename="seder-yom-export-${localDate(new Date())}.json"`);
    return {
      exportedAt: new Date().toISOString(),
      version: ctx.config.version,
      settings: loadHouseholdSettings(db),
      users: db
        .select({ id: users.id, username: users.username, displayName: users.displayName, role: users.role })
        .from(users)
        .all(),
      categories: db.select().from(categories).all(),
      entries: db.select().from(entries).all(),
      entryParticipants: db.select().from(entryParticipants).all(),
      entryExceptions: db.select().from(entryExceptions).all(),
      taskCompletions: db.select().from(taskCompletions).all(),
      shares: db.select().from(shares).all(),
    };
  });
}
