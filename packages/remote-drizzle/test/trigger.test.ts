/**
 * `revisionTrigger`: the database moves a revision on an update that does not
 * move it itself, and leaves alone one that does, so nothing moves twice.
 */
import { DatabaseSync } from 'node:sqlite'
import { PGlite } from '@electric-sql/pglite'
import { integer as pgInteger, pgSchema, pgTable, text as pgText } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Schema } from 'effect'
import { Entity, Write } from 'foldkit-entity'
import { Mutation } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bind, databaseLayer, revisionTrigger, writer } from '../src/index.js'

const Note = Entity.define(
  'Note',
  Schema.Struct({ id: Schema.String, body: Schema.String, version: Schema.Number }),
)
// The column's SQL name differs from its field's, and the table's from the Entity's.
const notes = sqliteTable('note_rows', {
  id: text('note_id').primaryKey(),
  body: text('body').notNull(),
  version: integer('row_version').notNull(),
})
const Db = bind({ Note }, { Note: { table: notes } })
const Edit = Mutation.write(
  'Edit',
  Write.update(
    Entity.input(
      Note,
      Schema.Struct({ id: Schema.String, body: Schema.String, version: Schema.Number }),
    ),
    { id: 'id', expect: 'version' },
  ),
)
const create =
  'create table note_rows (note_id text primary key, body text not null, row_version integer not null)'

describe('revisionTrigger', () => {
  it('moves the revision of a raw update, and once only for a declared write that moves it', async () => {
    const sqlite = new DatabaseSync(':memory:')
    sqlite.exec(create)
    sqlite.exec(revisionTrigger(Db.Note, 'version'))
    sqlite.exec("insert into note_rows values ('n1', 'first', 1), ('n2', 'other', 1)")
    sqlite.exec("update note_rows set body = 'raw' where note_id = 'n1'")
    const version = (id: string) =>
      sqlite.prepare('select row_version from note_rows where note_id = ?').get(id)
    expect(version('n1')).toEqual({ row_version: 2 })
    // Only the row updated moves.
    expect(version('n2')).toEqual({ row_version: 1 })
    const done = await Effect.runPromise(
      RemoteServer.handlers(
        RemoteServer.make({ entities: [], mutations: [RemoteServer.write(Edit, writer(Db.Note))] }),
        undefined,
      )
        .FoldkitRemoteMutate({
          requestId: 'r',
          mutation: 'Edit',
          input: { id: 'n1', body: 'declared', version: 2 },
        })
        .pipe(Effect.result, Effect.provide(databaseLayer(drizzle({ client: sqlite })))),
    )
    expect(done._tag).toBe('Success')
    expect(
      sqlite.prepare("select body, row_version from note_rows where note_id = 'n1'").get(),
    ).toEqual({
      body: 'declared',
      row_version: 3,
    })
  })

  it('leaves alone an update that sets the revision itself, to whatever it sets', () => {
    const sqlite = new DatabaseSync(':memory:')
    sqlite.exec(create)
    sqlite.exec(revisionTrigger(Db.Note, 'version'))
    sqlite.exec("insert into note_rows values ('n1', 'first', 1)")
    // As a journal's apply does: the revision set to a sequence, not moved by one.
    sqlite.exec("update note_rows set body = 'applied', row_version = 40 where note_id = 'n1'")
    expect(sqlite.prepare('select row_version from note_rows').get()).toEqual({ row_version: 40 })
  })

  it('can be run again, as a migration may be', () => {
    const sqlite = new DatabaseSync(':memory:')
    sqlite.exec(create)
    sqlite.exec(revisionTrigger(Db.Note, 'version'))
    sqlite.exec(revisionTrigger(Db.Note, 'version'))
    sqlite.exec("insert into note_rows values ('n1', 'first', 1)")
    sqlite.exec("update note_rows set body = 'raw' where note_id = 'n1'")
    // One trigger, so one move.
    expect(sqlite.prepare('select row_version from note_rows').get()).toEqual({ row_version: 2 })
  })

  it('refuses a revision the binding has no column for', () => {
    expect(() => revisionTrigger(Db.Note, 'revision')).toThrow(
      'Note has no column for its revision "revision"',
    )
  })

  describe('on Postgres', () => {
    const pgNotes = pgTable('note_rows', {
      id: pgText('note_id').primaryKey(),
      body: pgText('body').notNull(),
      version: pgInteger('row_version').notNull(),
    })
    const PgDb = bind({ Note }, { Note: { table: pgNotes } })
    let pglite: PGlite
    beforeAll(async () => {
      pglite = await PGlite.create()
    }, 60_000)
    afterAll(() => pglite.close())

    it('moves the revision of a raw update, and once only for one that moves it', async () => {
      await pglite.exec(create)
      await pglite.exec(revisionTrigger(PgDb.Note, 'version'))
      await pglite.exec("insert into note_rows values ('n1', 'first', 1)")
      await pglite.exec("update note_rows set body = 'raw' where note_id = 'n1'")
      await pglite.exec(
        "update note_rows set body = 'declared', row_version = row_version + 1 where note_id = 'n1'",
      )
      const rows = await pglite.query('select body, row_version from note_rows')
      expect(rows.rows).toEqual([{ body: 'declared', row_version: 3 }])
      // Set to a sequence, not moved by one: left as set.
      await pglite.exec("update note_rows set row_version = 40 where note_id = 'n1'")
      const set = await pglite.query('select row_version from note_rows')
      expect(set.rows).toEqual([{ row_version: 40 }])
      // Run again: replaced, not doubled.
      await pglite.exec(revisionTrigger(PgDb.Note, 'version'))
      await pglite.exec("update note_rows set body = 'again' where note_id = 'n1'")
      const again = await pglite.query('select row_version from note_rows')
      expect(again.rows).toEqual([{ row_version: 41 }])
    })

    it('names a table in a schema by its schema', async () => {
      const shop = pgSchema('shop')
      const scoped = shop.table('note_rows', {
        id: pgText('note_id').primaryKey(),
        body: pgText('body').notNull(),
        version: pgInteger('row_version').notNull(),
      })
      const Scoped = bind({ Note }, { Note: { table: scoped } })
      await pglite.exec(
        'create schema shop; create table shop.note_rows (note_id text primary key, body text not null, row_version integer not null)',
      )
      await pglite.exec(revisionTrigger(Scoped.Note, 'version'))
      await pglite.exec("insert into shop.note_rows values ('n1', 'first', 1)")
      await pglite.exec("update shop.note_rows set body = 'raw' where note_id = 'n1'")
      const rows = await pglite.query('select row_version from shop.note_rows')
      expect(rows.rows).toEqual([{ row_version: 2 }])
    })
  })
})

// A trigger's name and a Postgres function's are one per database (schema), and a
// table's name and its column's joined by `_` can come out alike (#328).
describe('revisionTrigger over two tables whose names join alike', () => {
  const Row = Entity.define('Row', Schema.Struct({ id: Schema.String, revision: Schema.Number }))
  const sqliteBound = {
    left: bind(
      { Row },
      {
        Row: {
          table: sqliteTable('a_b', {
            id: text('id').primaryKey(),
            revision: integer('c').notNull(),
          }),
        },
      },
    ).Row,
    right: bind(
      { Row },
      {
        Row: {
          table: sqliteTable('a', {
            id: text('id').primaryKey(),
            revision: integer('b_c').notNull(),
          }),
        },
      },
    ).Row,
  }
  const pgBound = {
    left: bind(
      { Row },
      {
        Row: {
          table: pgTable('a_b', {
            id: pgText('id').primaryKey(),
            revision: pgInteger('c').notNull(),
          }),
        },
      },
    ).Row,
    right: bind(
      { Row },
      {
        Row: {
          table: pgTable('a', {
            id: pgText('id').primaryKey(),
            revision: pgInteger('b_c').notNull(),
          }),
        },
      },
    ).Row,
  }
  const tables = [
    'create table a_b (id text primary key, c integer not null)',
    'create table a (id text primary key, b_c integer not null)',
    "insert into a_b values ('r', 1)",
    "insert into a values ('r', 1)",
  ]
  const touch = ["update a_b set id = id where id = 'r'", "update a set id = id where id = 'r'"]

  it('moves each table’s revision, on SQLite', () => {
    const sqlite = new DatabaseSync(':memory:')
    for (const statement of tables) sqlite.exec(statement)
    sqlite.exec(revisionTrigger(sqliteBound.left, 'revision'))
    sqlite.exec(revisionTrigger(sqliteBound.right, 'revision'))
    for (const statement of touch) sqlite.exec(statement)
    expect([
      sqlite.prepare('select c from a_b').get(),
      sqlite.prepare('select b_c from a').get(),
    ]).toEqual([{ c: 2 }, { b_c: 2 }])
    sqlite.close()
  })

  it('refuses a Postgres name past 63 bytes, which Postgres would cut and might join', () => {
    const long = bind(
      { Row },
      {
        Row: {
          table: pgTable('a'.repeat(50), {
            id: pgText('id').primaryKey(),
            revision: pgInteger('revision').notNull(),
          }),
        },
      },
    ).Row
    expect(() => revisionTrigger(long, 'revision')).toThrow("is longer than Postgres's 63 bytes")
    // SQLite has no such limit.
    const longLite = bind(
      { Row },
      {
        Row: {
          table: sqliteTable('a'.repeat(50), {
            id: text('id').primaryKey(),
            revision: integer('revision').notNull(),
          }),
        },
      },
    ).Row
    expect(revisionTrigger(longLite, 'revision')).toContain(`"${'a'.repeat(50)}_revision_moves"`)
  })

  it('moves each table’s revision, on Postgres', async () => {
    const pglite = await PGlite.create()
    for (const statement of tables) await pglite.exec(statement)
    await pglite.exec(revisionTrigger(pgBound.left, 'revision'))
    await pglite.exec(revisionTrigger(pgBound.right, 'revision'))
    for (const statement of touch) await pglite.exec(statement)
    expect([
      (await pglite.query('select c from a_b')).rows,
      (await pglite.query('select b_c from a')).rows,
    ]).toEqual([[{ c: 2 }], [{ b_c: 2 }]])
    await pglite.close()
  }, 60_000)
})
