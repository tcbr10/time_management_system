import { existsSync } from 'node:fs';
import path from 'node:path';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { userFromRequest } from './auth.js';
import { startMaintenance } from './backup.js';
import type { AppConfig } from './config.js';
import { createContext } from './context.js';
import type { AppDatabase } from './db/client.js';
import { HttpError } from './http.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerCalendarRoutes } from './routes/calendar.js';
import { registerCategoryRoutes } from './routes/categories.js';
import { registerEntryRoutes } from './routes/entries.js';
import { registerHealthRoute } from './routes/health.js';
import { registerSessionRoutes } from './routes/session.js';
import { registerShareRoutes } from './routes/shares.js';
import { registerStreamRoute } from './routes/stream.js';

export interface AppDeps {
  config: AppConfig;
  database: AppDatabase;
  logger?: boolean;
  /** Run the nightly backup and session clean-up; off in tests. */
  maintenance?: boolean;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  // trustProxy: behind Umbrel's app proxy the client address and protocol arrive in headers.
  // forceCloseConnections: live-update streams stay open and would otherwise block shutdown.
  const app = Fastify({ logger: deps.logger ?? true, trustProxy: true, forceCloseConnections: true });
  const ctx = createContext(deps.config, deps.database);

  await app.register(fastifyCookie);
  app.decorateRequest('user', null);
  app.addHook('onRequest', async (request) => {
    if (request.url.startsWith('/api/')) request.user = userFromRequest(ctx, request);
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send({ error: error.code });
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      return reply.code(status).send({ error: 'invalid_request' });
    }
    request.log.error(error);
    return reply.code(500).send({ error: 'internal_error' });
  });

  registerHealthRoute(app, deps);
  registerSessionRoutes(app, ctx);
  registerCategoryRoutes(app, ctx);
  registerEntryRoutes(app, ctx);
  registerCalendarRoutes(app, ctx);
  registerShareRoutes(app, ctx);
  registerStreamRoute(app, ctx);
  registerAdminRoutes(app, ctx);

  if (deps.maintenance) {
    const stop = startMaintenance(ctx, app.log);
    app.addHook('onClose', async () => stop());
  }

  const hasWeb = existsSync(path.join(deps.config.webDir, 'index.html'));
  if (hasWeb) {
    await app.register(fastifyStatic, {
      root: deps.config.webDir,
      setHeaders(reply, file) {
        // Built assets carry a content hash in their name; everything else must be revalidated.
        const hashed = file.includes(`${path.sep}assets${path.sep}`);
        reply.header('cache-control', hashed ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    });
  } else {
    app.log.warn({ webDir: deps.config.webDir }, 'Frontend build not found; serving API only');
  }

  // Unknown API paths are a JSON 404; any other GET falls back to the single-page app.
  app.setNotFoundHandler((request, reply) => {
    const isApi = request.url === '/api' || request.url.startsWith('/api/');
    if (hasWeb && !isApi && request.method === 'GET') {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ error: 'not_found' });
  });

  return app;
}
