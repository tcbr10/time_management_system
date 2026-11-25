import { mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import { purgeExpiredSessions } from './auth.js';
import type { Ctx } from './context.js';
import type { BackupDto } from './shared/types.js';

const KEEP = 14;
const PREFIX = 'seder-yom-';
const HOUR = 3_600_000;

function backupDir(ctx: Ctx): string {
  return path.join(ctx.config.dataDir, 'backups');
}

/** Local calendar date, so "one backup per day" follows the household's clock (TZ). */
export function localDate(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function listBackups(ctx: Ctx): BackupDto[] {
  let names: string[];
  try {
    names = readdirSync(backupDir(ctx));
  } catch {
    return [];
  }
  return names
    .filter((name) => name.startsWith(PREFIX) && name.endsWith('.db'))
    .map((name) => {
      const stats = statSync(path.join(backupDir(ctx), name));
      return { name, size: stats.size, createdAt: stats.mtimeMs };
    })
    .sort((a, b) => b.name.localeCompare(a.name));
}

/** Writes today's backup (replacing an earlier one from today) and drops the oldest beyond KEEP. */
export async function runBackup(ctx: Ctx, now = new Date()): Promise<BackupDto> {
  const dir = backupDir(ctx);
  mkdirSync(dir, { recursive: true });
  const name = `${PREFIX}${localDate(now)}.db`;
  await ctx.database.backup(path.join(dir, name));
  const all = listBackups(ctx);
  for (const old of all.slice(KEEP)) unlinkSync(path.join(dir, old.name));
  return all.find((backup) => backup.name === name)!;
}

/** Hourly: make sure today has a backup and clear expired sessions. Returns a stop function. */
export function startMaintenance(ctx: Ctx, log: FastifyBaseLogger): () => void {
  const tick = async () => {
    try {
      purgeExpiredSessions(ctx);
      const today = `${PREFIX}${localDate(new Date())}.db`;
      if (!listBackups(ctx).some((backup) => backup.name === today)) {
        const backup = await runBackup(ctx);
        log.info({ backup: backup.name }, 'Daily backup written');
      }
    } catch (error) {
      log.error(error, 'Maintenance failed');
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), HOUR);
  timer.unref();
  return () => clearInterval(timer);
}
