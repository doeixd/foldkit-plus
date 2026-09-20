/**
 * The three tables the CMS keeps beside the application's own. Drizzle tables
 * are made per dialect, so there is one definition for each; they have the same
 * columns. An application adds them to its schema and its migrations as it does
 * any table, and may define its own instead, so long as the columns are these.
 */
import { integer as pgInteger, jsonb, pgTable, text as pgText } from 'drizzle-orm/pg-core'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * - `cms_entries`: a piece of content from first keystroke to archive. It exists
 *   before its content row does.
 * - `cms_drafts`: an entry's one working copy; its id is the entry's.
 * - `cms_revisions`: published values, append-only.
 */
export const sqliteTables = () => ({
  entries: sqliteTable('cms_entries', {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    targetId: text('target_id'),
    label: text('label').notNull(),
    createdBy: text('created_by'),
    createdAt: text('created_at').notNull(),
    archivedAt: text('archived_at'),
  }),
  drafts: sqliteTable('cms_drafts', {
    id: text('id').primaryKey(),
    values: text('values', { mode: 'json' }),
    model: text('model', { mode: 'json' }),
    form: text('form').notNull(),
    updatedAt: text('updated_at').notNull(),
    updatedBy: text('updated_by'),
    baseRevision: integer('base_revision'),
    scheduledFor: text('scheduled_for'),
    scheduleError: text('schedule_error'),
  }),
  revisions: sqliteTable('cms_revisions', {
    id: text('id').primaryKey(),
    entryId: text('entry_id').notNull(),
    n: integer('n').notNull(),
    values: text('values', { mode: 'json' }),
    publishedAt: text('published_at').notNull(),
    publishedBy: text('published_by'),
  }),
})

export const pgTables = () => ({
  entries: pgTable('cms_entries', {
    id: pgText('id').primaryKey(),
    type: pgText('type').notNull(),
    targetId: pgText('target_id'),
    label: pgText('label').notNull(),
    createdBy: pgText('created_by'),
    createdAt: pgText('created_at').notNull(),
    archivedAt: pgText('archived_at'),
  }),
  drafts: pgTable('cms_drafts', {
    id: pgText('id').primaryKey(),
    values: jsonb('values'),
    model: jsonb('model'),
    form: pgText('form').notNull(),
    updatedAt: pgText('updated_at').notNull(),
    updatedBy: pgText('updated_by'),
    baseRevision: pgInteger('base_revision'),
    scheduledFor: pgText('scheduled_for'),
    scheduleError: pgText('schedule_error'),
  }),
  revisions: pgTable('cms_revisions', {
    id: pgText('id').primaryKey(),
    entryId: pgText('entry_id').notNull(),
    n: pgInteger('n').notNull(),
    values: jsonb('values'),
    publishedAt: pgText('published_at').notNull(),
    publishedBy: pgText('published_by'),
  }),
})

/** The `create table` statements for SQLite, for a test or a first migration. */
export const sqliteSchema = `
create table if not exists cms_entries (
  id text primary key, type text not null, target_id text, label text not null,
  created_by text, created_at text not null, archived_at text
);
create table if not exists cms_drafts (
  id text primary key, "values" text, model text, form text not null,
  updated_at text not null, updated_by text, base_revision integer,
  scheduled_for text, schedule_error text
);
create table if not exists cms_revisions (
  id text primary key, entry_id text not null, n integer not null, "values" text,
  published_at text not null, published_by text
);
`

export type CmsTables = ReturnType<typeof sqliteTables> | ReturnType<typeof pgTables>
