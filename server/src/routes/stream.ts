import type { FastifyInstance } from 'fastify';
import type { Ctx } from '../context.js';
import { requireUser } from '../http.js';

const KEEP_ALIVE_MS = 25_000;

export function registerStreamRoute(app: FastifyInstance, ctx: Ctx): void {
  // Server-sent events: one "change" event whenever household data changes, so every open
  // calendar refetches. The event carries no data; permissions stay with the normal endpoints.
  app.get('/api/stream', { logLevel: 'warn' }, (request, reply) => {
    requireUser(request);
    reply.hijack();
    const stream = reply.raw;
    stream.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      // Tells nginx-style proxies (Umbrel's app proxy included) not to buffer the stream.
      'x-accel-buffering': 'no',
    });
    stream.write('retry: 3000\n\n');

    const unsubscribe = ctx.onChange(() => stream.write('event: change\ndata: {}\n\n'));
    const keepAlive = setInterval(() => stream.write(': keep-alive\n\n'), KEEP_ALIVE_MS);
    request.raw.on('close', () => {
      clearInterval(keepAlive);
      unsubscribe();
    });
  });
}
