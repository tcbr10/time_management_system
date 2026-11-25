import { mkdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema.js';

export interface AppDatabase {
  db: ReturnType<typeof drizzle<typeof schema>>;
  /** Path of the SQLite file. */
  file: string;
  /** True when a trivial query succeeds. */
  ping(): boolean;
  /** ISO timestamp of the first start against this data directory. */
  installedAt: string;
  /** Writes a consistent copy of the live database to `file`. */
  backup(file: string): Promise<void>;
  close(): void;
}

/** Opens (creating if needed) the SQLite file in `dataDir` and applies pending migrations. */
export function openDatabase(dataDir: string, migrationsDir: string): AppDatabase {
  mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, 'app.db');
  const sqlite = new Database(file);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: migrationsDir });

  db.insert(schema.settings)
    .values({ key: 'installed_at', value: new Date().toISOString() })
    .onConflictDoNothing()
    .run();
  const installed = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, 'installed_at'))
    .get();

  return {
    db,
    file,
    installedAt: installed!.value,
    ping() {
      try {
        sqlite.prepare('SELECT 1').get();
        return true;
      } catch {
        return false;
      }
    },
    async backup(file) {
      await sqlite.backup(file);
    },
    close() {
      sqlite.close();
    },
  };
}
