import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolves to the `server/` directory both from `src/` (dev) and from `dist/` (built).
const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(serverRoot, '..');

export interface AppConfig {
  host: string;
  port: number;
  /** Directory holding the SQLite file; a mounted volume in production. */
  dataDir: string;
  /** Directory with the built frontend. */
  webDir: string;
  migrationsDir: string;
  version: string;
  commit: string | null;
}

function packageVersion(): string {
  const pkg = JSON.parse(readFileSync(path.join(serverRoot, 'package.json'), 'utf8')) as {
    version: string;
  };
  return pkg.version;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${env.PORT}`);
  }
  return {
    host: env.HOST ?? '0.0.0.0',
    port,
    dataDir: path.resolve(env.DATA_DIR ?? path.join(repoRoot, 'data')),
    webDir: path.resolve(env.WEB_DIR ?? path.join(repoRoot, 'web', 'dist')),
    migrationsDir: path.join(serverRoot, 'drizzle'),
    version: env.APP_VERSION || packageVersion(),
    commit: env.APP_COMMIT || null,
  };
}
