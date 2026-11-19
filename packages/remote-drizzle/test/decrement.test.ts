/**
 * A declared write's `decrement`, taken away in the statement that writes, on
 * SQLite and Postgres: the field moves down by the amount once, beside an
 * increment from the same key, and a retry of a write that landed is a
 * conflict, never a second withdrawal.
 */
import { postgres } from '../src/pg.js'
import { DatabaseSync } from 'node:sqlite'
import { PGlite } from '@electric-sql/pglite'
import { drizzle as drizzlePg } from 'drizzle-orm/pglite'
import { doublePrecision, integer as pgInteger, pgTable, text as pgText } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Schema } from 'effect'
import { Entity, Write } from 'foldkit-entity'
import { Mutation } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bind, databaseLayer, writer } from '../src/index.js'

postgres()

const Account = Entity.define(
  'Account',
  Schema.Struct({
    id: Schema.String,
    balance: Schema.Number,
    withdrawnToday: Schema.Number,
    revision: Schema.Number,
  }),
)
const Withdraw = Mutation.write(
  'Withdraw',
  Write.update(
    Entity.input(
      Account,
      Schema.Struct({ id: Schema.String, revision: Schema.Number, amount: Schema.Number }),
      { amount: Entity.unmapped },
    ),
    {
      id: 'id',
      expect: 'revision',
      increment: { withdrawnToday: 'amount' },
      decrement: { balance: 'amount' },
    },
  ),
)

const create =
  'create table accounts (id text primary key, balance double precision not null, withdrawn_today double precision not null, revision integer not null)'
const refusedAs = (tag: string) => ({ _tag: 'Failure', failure: { refusal: { _tag: tag } } })
let requests = 0
const runner = (
  table: Parameters<typeof bind>[1]['Account']['table'],
  layer: () => ReturnType<typeof databaseLayer>,
) => {
  const handlers = RemoteServer.handlers(
    RemoteServer.make({
      entities: [],
      mutations: [
        RemoteServer.write(Withdraw, writer(bind({ Account }, { Account: { table } }).Account)),
      ],
    }),
    undefined,
  )
  return (input: unknown) =>
    Effect.runPromise(
      handlers
        .FoldkitRemoteMutate({ requestId: `r${++requests}`, mutation: 'Withdraw', input })
        .pipe(Effect.result, Effect.provide(layer())),
    )
}

describe('A write that decrements a field, on SQLite', () => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(create)
  sqlite.exec("insert into accounts values ('a1', 100, 0, 1)")
  afterAll(() => sqlite.close())
  const run = runner(
    sqliteTable('accounts', {
      id: text('id').primaryKey(),
      balance: real('balance').notNull(),
      withdrawnToday: real('withdrawn_today').notNull(),
      revision: integer('revision').notNull(),
    }),
    () => databaseLayer(drizzle({ client: sqlite })),
  )

  it('takes the amount from one field as it adds it to another, once', async () => {
    expect(await run({ id: 'a1', revision: 1, amount: 30.5 })).toMatchObject({
      _tag: 'Success',
      success: { entities: [{ id: 'a1', values: { balance: 69.5, withdrawnToday: 30.5 } }] },
    })
    expect(await run({ id: 'a1', revision: 1, amount: 30.5 })).toMatchObject(refusedAs('Conflict'))
    expect(sqlite.prepare('select balance, withdrawn_today, revision from accounts').get()).toEqual(
      {
        balance: 69.5,
        withdrawn_today: 30.5,
        revision: 2,
      },
    )
  })
})

describe('A write that decrements a field, on Postgres', () => {
  let pglite: PGlite
  beforeAll(async () => {
    pglite = await PGlite.create()
    await pglite.exec(create)
    await pglite.exec("insert into accounts values ('a1', 100, 0, 1)")
  }, 60_000)
  afterAll(() => pglite.close())
  const run = runner(
    pgTable('accounts', {
      id: pgText('id').primaryKey(),
      balance: doublePrecision('balance').notNull(),
      withdrawnToday: doublePrecision('withdrawn_today').notNull(),
      revision: pgInteger('revision').notNull(),
    }),
    () => databaseLayer(drizzlePg({ client: pglite })),
  )

  it('takes the amount from one field as it adds it to another, once', async () => {
    expect((await run({ id: 'a1', revision: 1, amount: 30.5 }))._tag).toBe('Success')
    expect(await run({ id: 'a1', revision: 1, amount: 30.5 })).toMatchObject(refusedAs('Conflict'))
    const rows = await pglite.query('select balance, withdrawn_today, revision from accounts')
    expect(rows.rows).toEqual([{ balance: 69.5, withdrawn_today: 30.5, revision: 2 }])
  })
})
