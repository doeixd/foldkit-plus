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
    const pglite = new PGlite()
    beforeAll(() => pglite.waitReady, 60_000)
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
