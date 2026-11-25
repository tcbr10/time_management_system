import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** Instance-wide key/value settings (install date, later: session secret, active hours). */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
