import { eq } from 'drizzle-orm'
import type { NodeSQLiteDatabase } from 'drizzle-orm/node-sqlite'
import { pgTable, text, type PgColumn } from 'drizzle-orm/pg-core'
import type { PgliteDatabase } from 'drizzle-orm/pglite'
import { sqliteTable, text as sqliteText, type SQLiteColumn } from 'drizzle-orm/sqlite-core'
import { expectTypeOf } from 'vitest'
import { entity, one, returning } from '../src/index.js'

// `returning(binding, fields).columns` goes to each dialect's own `.returning`
// with no cast (#338).

const pgUsers = pgTable('users', { id: text('id').primaryKey() })
const pgProjects = pgTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  ownerId: text('owner_id').notNull(),
})
const PgUser = entity('User', pgUsers)
const PgProject = entity('Project', pgProjects, {
  relations: { owner: one(PgUser, { field: pgProjects.ownerId }) },
})
declare const pg: PgliteDatabase

const pgProject = returning(PgProject, ['id', 'name', 'owner'])
expectTypeOf(pgProject.columns).toEqualTypeOf<Record<string, PgColumn>>()
export const pgUpdated = pg
  .update(pgProjects)
  .set({ name: 'renamed' })
  .where(eq(pgProjects.id, 'p1'))
  .returning(pgProject.columns)
  .then(rows => pgProject.patches(rows))
export const pgInserted = pg
  .insert(pgProjects)
  .values({ id: 'p2', name: 'new', ownerId: 'u1' })
  .returning(pgProject.columns)
export const pgDeleted = pg
  .delete(pgProjects)
  .where(eq(pgProjects.id, 'p1'))
  .returning(pgProject.columns)

const liteUsers = sqliteTable('users', { id: sqliteText('id').primaryKey() })
const liteProjects = sqliteTable('projects', {
  id: sqliteText('id').primaryKey(),
  name: sqliteText('name').notNull(),
  ownerId: sqliteText('owner_id').notNull(),
})
const LiteUser = entity('User', liteUsers)
const LiteProject = entity('Project', liteProjects, {
  relations: { owner: one(LiteUser, { field: liteProjects.ownerId }) },
})
declare const lite: NodeSQLiteDatabase

const liteProject = returning(LiteProject, ['id', 'name', 'owner'])
expectTypeOf(liteProject.columns).toEqualTypeOf<Record<string, SQLiteColumn>>()
export const liteUpdated = lite
  .update(liteProjects)
  .set({ name: 'renamed' })
  .where(eq(liteProjects.id, 'p1'))
  .returning(liteProject.columns)
  .then(rows => liteProject.patches(rows))

// A SQLite binding's columns are not Postgres columns.
// @ts-expect-error SQLite columns cannot be returned from a Postgres statement
export const crossed = pg.update(pgProjects).set({ name: 'x' }).returning(liteProject.columns)
