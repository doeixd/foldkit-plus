// @vitest-environment node
/**
 * An unledgered update pinned to a revision, sent again after its answer was
 * lost (#291): the row one revision on and holding what it sets is its own
 * landing, whatever time the retry was stamped with, since a field the write
 * sets from its clock (`Entity.sets` with `Expr.now`) is no evidence the write
 * differs. ops-4-captured-now-DESIGN, "A retry without a ledger".
 */
import { DatabaseSync } from 'node:sqlite'
import { PGlite } from '@electric-sql/pglite'
import { integer as pgInteger, pgTable, text as pgText } from 'drizzle-orm/pg-core'
import { drizzle as drizzlePg } from 'drizzle-orm/pglite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Clock, Effect, Schema } from 'effect'
import { Entity, Expr, Write } from 'foldkit-entity'
import { Mutation } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bind, databaseLayer, writer } from '../src/index.js'

const Note = Entity.define(
  'Note',
  Schema.Struct({
    id: Schema.String,
    body: Schema.String,
    revision: Schema.Number,
    editedAt: Schema.Number,
  }),
).pipe(Entity.sets({ editedAt: Expr.now }, { on: 'write' }))

const EditNote = Mutation.write(
  'EditNote',
  Write.update(
    Entity.input(
      Note,
      Schema.Struct({ id: Schema.String, body: Schema.String, revision: Schema.Number }),
    ),
    { id: 'id', expect: 'revision' },
  ),
)

const sqliteNotes = bind(
  { Note },
  {
    Note: {
      table: sqliteTable('notes', {
        id: text('id').primaryKey(),
        body: text('body').notNull(),
        revision: integer('revision').notNull(),
        editedAt: integer('edited_at').notNull(),
      }),
    },
  },
).Note
const pgNotes = bind(
  { Note },
  {
    Note: {
      table: pgTable('notes', {
        id: pgText('id').primaryKey(),
        body: pgText('body').notNull(),
        revision: pgInteger('revision').notNull(),
        editedAt: pgInteger('edited_at').notNull(),
      }),
    },
  },
).Note

const statements = [
  'create table notes (id text primary key, body text not null, revision integer not null, edited_at integer not null)',
  "insert into notes values ('n1', 'Hi', 1, 5)",
]

const dialects = [
  {
    name: 'SQLite',
    open: async () => {
      const client = new DatabaseSync(':memory:')
      for (const statement of statements) client.exec(statement)
      return {
        binding: sqliteNotes,
        layer: databaseLayer(drizzle({ client })),
        stored: async () => client.prepare('select body, revision, edited_at from notes').all(),
        close: async () => client.close(),
      }
    },
  },
  {
    name: 'Postgres',
    open: async () => {
      const client = new PGlite()
      for (const statement of statements) await client.exec(statement)
      return {
        binding: pgNotes,
        layer: databaseLayer(drizzlePg({ client })),
        stored: async () =>
          (await client.query('select body, revision, edited_at from notes')).rows,
        close: () => client.close(),
      }
    },
  },
]

/** A clock that reads `at`. */
const clockAt = (at: number): Clock.Clock => ({
  currentTimeMillisUnsafe: () => at,
  currentTimeMillis: Effect.succeed(at),
  currentTimeNanosUnsafe: () => BigInt(at) * 1_000_000n,
  currentTimeNanos: Effect.succeed(BigInt(at) * 1_000_000n),
  monotonicTimeNanosUnsafe: () => BigInt(at) * 1_000_000n,
  monotonicTimeNanos: Effect.succeed(BigInt(at) * 1_000_000n),
  sleep: () => Effect.void,
})

describe.each(dialects)('an unledgered pinned update sent again, on $name', ({ open }) => {
  let database: Awaited<ReturnType<(typeof dialects)[number]['open']>>
  beforeAll(async () => {
    database = await open()
  }, 60_000)
  afterAll(() => database.close())

  // No `now` sent: each attempt is stamped with the server's clock at it.
  const edit = (body: string, at: number) =>
    Effect.runPromise(
      RemoteServer.handlers(
        RemoteServer.make({
          entities: [],
          mutations: [RemoteServer.write(EditNote, writer(database.binding))],
        }),
        undefined,
      )
        .FoldkitRemoteMutate({
          requestId: `r${at}`,
          mutation: 'EditNote',
          input: { id: 'n1', body, revision: 1 },
        })
        .pipe(
          Effect.provide(database.layer),
          Effect.provideService(Clock.Clock, clockAt(at)),
          Effect.result,
        ),
    )

  it('answers its own landing, at a later time, and keeps the time that landed', async () => {
    const first = await edit('Again', 1_000)
    expect(first._tag).toBe('Success')
    expect(await edit('Again', 9_000)).toMatchObject({
      _tag: 'Success',
      success: {
        entities: [{ id: 'n1', values: { body: 'Again', revision: 2, editedAt: 1_000 } }],
      },
    })
    // Another write from that revision still conflicts.
    expect((await edit('Other', 9_000))._tag).toBe('Failure')
    expect(await database.stored()).toEqual([{ body: 'Again', revision: 2, edited_at: 1_000 }])
  })
})
