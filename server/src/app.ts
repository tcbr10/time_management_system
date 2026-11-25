import { existsSync } from 'node:fs';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import type { AppConfig } from './config.js';
import type { AppDatabase } from './db/client.js';
import { registerHealthRoute } from './routes/health.js';

export interface AppDeps {
  config: AppConfig;
  database: AppDatabase;
  logger?: boolean;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: deps.logger ?? true });

  registerHealthRoute(app, deps);

  const hasWeb = existsSync(path.join(deps.config.webDir, 'index.html'));
  if (hasWeb) {
    await app.register(fastifyStatic, { root: deps.config.webDir });
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
