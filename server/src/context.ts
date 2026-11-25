import type { AppConfig } from './config.js';
import type { AppDatabase } from './db/client.js';

export interface Ctx {
  config: AppConfig;
  database: AppDatabase;
  db: AppDatabase['db'];
  /** Call after any change other clients should pick up. */
  changed(): void;
  /** Subscribes to change notifications; returns an unsubscribe function. */
  onChange(listener: () => void): () => void;
}

export function createContext(config: AppConfig, database: AppDatabase): Ctx {
  const listeners = new Set<() => void>();
  return {
    config,
    database,
    db: database.db,
    changed() {
      for (const listener of listeners) listener();
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
