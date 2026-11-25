import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig, type AppConfig } from '../src/config.js';
import { openDatabase } from '../src/db/client.js';
import type { HealthResponse } from '../src/routes/health.js';

let dataDir: string;
let config: AppConfig;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'tms-test-'));
  config = loadConfig({ DATA_DIR: dataDir, WEB_DIR: path.join(dataDir, 'no-web'), APP_VERSION: '9.9.9' });
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

describe('GET /api/health', () => {
  it('reports ok with version and database state', async () => {
    const database = openDatabase(config.dataDir, config.migrationsDir);
    const app = await buildApp({ config, database, logger: false });

    const response = await app.inject({ method: 'GET', url: '/api/health' });
    const body = response.json<HealthResponse>();

    expect(response.statusCode).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.version).toBe('9.9.9');
    expect(body.database).toEqual({ ok: true, installedAt: database.installedAt });
    expect(Number.isNaN(Date.parse(body.serverTime))).toBe(false);

    await app.close();
    database.close();
  });

  it('returns 503 when the database is unavailable', async () => {
    const database = openDatabase(config.dataDir, config.migrationsDir);
    const app = await buildApp({ config, database, logger: false });
    database.close();

    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(503);
    expect(response.json<HealthResponse>().status).toBe('error');
    await app.close();
  });
});

describe('data directory', () => {
  it('keeps the install date across restarts', async () => {
    const first = openDatabase(config.dataDir, config.migrationsDir);
    const installedAt = first.installedAt;
    first.close();
    await new Promise((resolve) => setTimeout(resolve, 5));

    const second = openDatabase(config.dataDir, config.migrationsDir);
    expect(second.installedAt).toBe(installedAt);
    second.close();
  });
});

describe('unknown routes', () => {
  it('answers unknown API paths with a JSON 404', async () => {
    const database = openDatabase(config.dataDir, config.migrationsDir);
    const app = await buildApp({ config, database, logger: false });

    const response = await app.inject({ method: 'GET', url: '/api/nope' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'not_found' });
    await app.close();
    database.close();
  });
});
