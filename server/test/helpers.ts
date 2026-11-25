import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { openDatabase, type AppDatabase } from '../src/db/client.js';

export interface TestApp {
  app: FastifyInstance;
  database: AppDatabase;
  close(): Promise<void>;
}

export async function createTestApp(): Promise<TestApp> {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'tms-test-'));
  const config = loadConfig({ DATA_DIR: dataDir, WEB_DIR: path.join(dataDir, 'no-web') });
  const database = openDatabase(config.dataDir, config.migrationsDir);
  const app = await buildApp({ config, database, logger: false });
  return {
    app,
    database,
    async close() {
      await app.close();
      database.close();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

/** A signed-in client: keeps the session cookie between requests. */
export class Client {
  private cookie = '';

  constructor(private readonly app: FastifyInstance) {}

  async request<T = unknown>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, body?: unknown) {
    const response = await this.app.inject({
      method,
      url,
      payload: body === undefined ? undefined : (body as object),
      headers: this.cookie ? { cookie: this.cookie } : {},
    });
    const set = response.cookies.find((c) => c.name === 'sid');
    if (set) this.cookie = set.value ? `sid=${set.value}` : '';
    return { status: response.statusCode, body: response.json<T>() };
  }

  get<T = unknown>(url: string) {
    return this.request<T>('GET', url);
  }
  post<T = unknown>(url: string, body: unknown = {}) {
    return this.request<T>('POST', url, body);
  }
  put<T = unknown>(url: string, body: unknown = {}) {
    return this.request<T>('PUT', url, body);
  }
  delete<T = unknown>(url: string) {
    return this.request<T>('DELETE', url);
  }
}

/** Sets up a household with an admin (noa) and a member (itai) who joined by invite. */
export async function household(t: TestApp): Promise<{ noa: Client; itai: Client; noaId: number; itaiId: number }> {
  const noa = new Client(t.app);
  const itai = new Client(t.app);
  const admin = await noa.post<{ id: number }>('/api/setup', {
    username: 'noa',
    displayName: 'נועה',
    password: 'correct horse',
  });
  const invite = await noa.post<{ token: string }>('/api/invites');
  const member = await itai.post<{ id: number }>(`/api/invites/${invite.body.token}/accept`, {
    username: 'itai',
    displayName: 'איתי',
    password: 'battery staple',
  });
  return { noa, itai, noaId: admin.body.id, itaiId: member.body.id };
}
