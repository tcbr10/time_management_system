import { existsSync, readdirSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runBackup } from '../src/backup.js';
import { loadConfig } from '../src/config.js';
import { createContext } from '../src/context.js';
import type { BackupDto } from '../src/shared/types.js';
import { createTestApp, household, type TestApp } from './helpers.js';

let t: TestApp;
beforeEach(async () => {
  t = await createTestApp();
});
afterEach(async () => {
  await t.close();
});

describe('backups', () => {
  it('lets only an admin create and list backups, and the copy is a readable database', async () => {
    const { noa, itai } = await household(t);
    expect((await itai.post('/api/admin/backups')).status).toBe(403);
    expect((await itai.get('/api/admin/export')).status).toBe(403);

    const created = await noa.post<BackupDto>('/api/admin/backups');
    expect(created.status).toBe(200);
    expect(created.body.name).toMatch(/^seder-yom-\d{4}-\d{2}-\d{2}\.db$/);
    expect((await noa.get<BackupDto[]>('/api/admin/backups')).body.map((b) => b.name)).toEqual([created.body.name]);

    const dataDir = path.dirname(t.database.file);
    const copy = new Database(path.join(dataDir, 'backups', created.body.name), { readonly: true });
    expect(copy.prepare('SELECT username FROM users ORDER BY id').all()).toEqual([{ username: 'noa' }, { username: 'itai' }]);
    copy.close();
  });

  it('keeps the 14 most recent daily backups', async () => {
    const dataDir = path.dirname(t.database.file);
    const ctx = createContext(loadConfig({ DATA_DIR: dataDir }), t.database);
    for (let day = 1; day <= 16; day++) await runBackup(ctx, new Date(2026, 0, day, 12));
    const names = readdirSync(path.join(dataDir, 'backups')).sort();
    expect(names).toHaveLength(14);
    expect(names[0]).toBe('seder-yom-2026-01-03.db');
    expect(existsSync(path.join(dataDir, 'backups', 'seder-yom-2026-01-16.db'))).toBe(true);
  });

  it('exports household data without password hashes', async () => {
    const { noa } = await household(t);
    const dump = (await noa.get<Record<string, unknown>>('/api/admin/export')).body;
    expect(Object.keys(dump)).toContain('entries');
    expect(JSON.stringify(dump)).not.toContain('scrypt$');
    expect(dump.users).toHaveLength(2);
  });
});

describe('live updates', () => {
  it('pushes a change event to signed-in listeners when data changes', async () => {
    const { noa } = await household(t);
    await t.app.listen({ host: '127.0.0.1', port: 0 });
    const { port } = t.app.server.address() as AddressInfo;

    const unauthenticated = await fetch(`http://127.0.0.1:${port}/api/stream`);
    expect(unauthenticated.status).toBe(401);

    const received = new Promise<string>((resolve, reject) => {
      const request = http.get({ host: '127.0.0.1', port, path: '/api/stream', headers: { cookie: noa.cookieHeader } }, (response) => {
        let buffer = '';
        response.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          if (buffer.includes('event: change')) {
            request.destroy();
            resolve(buffer);
          }
        });
      });
      request.on('error', (error) => (String(error).includes('socket hang up') ? undefined : reject(error)));
      setTimeout(() => reject(new Error('no event received')), 4000);
    });

    // Give the stream a moment to subscribe, then change something.
    await new Promise((resolve) => setTimeout(resolve, 100));
    await noa.post('/api/categories', { kind: 'routine', name: 'חדש', color: 'teal', isChore: false });
    expect(await received).toContain('event: change');
  });
});
