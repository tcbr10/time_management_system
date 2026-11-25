import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config.js';
import type { AppDatabase } from '../db/client.js';

export interface HealthResponse {
  status: 'ok' | 'error';
  version: string;
  commit: string | null;
  serverTime: string;
  timeZone: string;
  uptimeSeconds: number;
  database: { ok: boolean; installedAt: string };
}

export function registerHealthRoute(
  app: FastifyInstance,
  deps: { config: AppConfig; database: AppDatabase },
): void {
  // Polled by the container health check every few seconds, so keep it out of the request log.
  app.get('/api/health', { logLevel: 'warn' }, async (_request, reply) => {
    const dbOk = deps.database.ping();
    const body: HealthResponse = {
      status: dbOk ? 'ok' : 'error',
      version: deps.config.version,
      commit: deps.config.commit,
      serverTime: new Date().toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      uptimeSeconds: Math.round(process.uptime()),
      database: { ok: dbOk, installedAt: deps.database.installedAt },
    };
    return reply.code(dbOk ? 200 : 503).send(body);
  });
}
