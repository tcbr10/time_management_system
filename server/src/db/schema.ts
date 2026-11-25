import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** Instance-wide key/value settings (install date, active hours). */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['admin', 'member'] }).notNull(),
  createdAt: integer('created_at').notNull(),
});

export const sessions = sqliteTable('sessions', {
  /** SHA-256 of the cookie token, so a leaked database does not leak live sessions. */
  id: text('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at').notNull(),
});

export const invites = sqliteTable('invites', {
  token: text('token').primaryKey(),
  createdBy: integer('created_by')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at').notNull(),
});

export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  kind: text('kind', { enum: ['routine', 'task'] }).notNull(),
  name: text('name').notNull(),
  color: text('color').notNull(),
  isChore: integer('is_chore', { mode: 'boolean' }).notNull().default(false),
  sort: integer('sort').notNull().default(0),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
});

export const entries = sqliteTable('entries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ownerId: integer('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: ['routine', 'task'] }).notNull(),
  categoryId: integer('category_id')
    .notNull()
    .references(() => categories.id),
  title: text('title').notNull(),
  notes: text('notes').notNull().default(''),
  /** Minutes from midnight, local wall-clock time. */
  startMin: integer('start_min').notNull(),
  endMin: integer('end_min').notNull(),
  /** Set for a one-off entry; null for a weekly series. */
  date: text('date'),
  /** Bit 0 = Sunday … bit 6 = Saturday. */
  daysMask: integer('days_mask').notNull().default(0),
  intervalWeeks: integer('interval_weeks').notNull().default(1),
  startDate: text('start_date'),
  endDate: text('end_date'),
  isPrivate: integer('is_private', { mode: 'boolean' }).notNull().default(false),
});

/** Everyone the entry belongs to, the owner included. */
export const entryParticipants = sqliteTable(
  'entry_participants',
  {
    entryId: integer('entry_id')
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.entryId, t.userId] })],
);

/** A single occurrence of a series that was skipped or moved to another time that day. */
export const entryExceptions = sqliteTable(
  'entry_exceptions',
  {
    entryId: integer('entry_id')
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    type: text('type', { enum: ['skip', 'move'] }).notNull(),
    startMin: integer('start_min'),
    endMin: integer('end_min'),
  },
  (t) => [primaryKey({ columns: [t.entryId, t.date] })],
);

export const taskCompletions = sqliteTable(
  'task_completions',
  {
    entryId: integer('entry_id')
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    doneBy: integer('done_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    doneAt: integer('done_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.entryId, t.date] })],
);

/** What `ownerId` lets `granteeId` see of the owner's calendar. No row means 'none'. */
export const shares = sqliteTable(
  'shares',
  {
    ownerId: integer('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    granteeId: integer('grantee_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    level: text('level', { enum: ['busy', 'view', 'edit'] }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.ownerId, t.granteeId] })],
);
