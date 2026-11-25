import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { openDatabase } from './db/client.js';

const config = loadConfig();
const database = openDatabase(config.dataDir, config.migrationsDir);
const app = await buildApp({ config, database, maintenance: true });

let closing = false;
async function shutdown(signal: string): Promise<void> {
  if (closing) return;
  closing = true;
  app.log.info({ signal }, 'Shutting down');
  await app.close();
  database.close();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error);
  database.close();
  process.exit(1);
}
