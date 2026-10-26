/**
 * A writer's ledger: each update it lands is recorded under the operation
 * that asked for it, in the same transaction, so a retry is answered from the
 * record and concurrent increments, expecting no revision, both land.
 */
import { DatabaseSync } from 'node:sqlite'
import { PGlite } from '@electric-sql/pglite'
import { drizzle as drizzlePg } from 'drizzle-orm/pglite'
import {
  integer as pgInteger,
  bigint as pgBigint,
  pgTable,
  primaryKey as pgPrimaryKey,
  text as pgText,
} from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Option, Schema } from 'effect'
import { Entity, Write } from 'foldkit-entity'
import { Mutation } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { bind, databaseLayer, writer, type DrizzleDatabase } from '../src/index.js'

const Item = Entity.define(
  'Item',
  Schema.Struct({ id: Schema.String, stock: Schema.Number, revision: Schema.Number }),
)
const items = sqliteTable('items', {
  id: text('id').primaryKey(),
  stock: integer('stock').notNull(),
  revision: integer('revision').notNull(),
})
const ledgerTable = sqliteTable(
  'write_ledger',
  {
    scope: text('scope').notNull(),
    operation: text('operation').notNull(),
    target: text('target').notNull(),
    answer: text('answer').notNull(),
    at: integer('at').notNull(),
  },
  table => [primaryKey({ columns: [table.scope, table.operation, table.target] })],
)
const Db = bind({ Item }, { Item: { table: items } })

// An increment that expects no revision: only the ledger keeps a retry from adding twice.
const Restock = Mutation.write(
  'Restock',
  Write.update(
    Entity.input(Item, Schema.Struct({ id: Schema.String, quantity: Schema.Int }), {
      quantity: Entity.unmapped,
    }),
    { id: 'id', increment: { stock: 'quantity' } },
  ),
)

const schema = `
  create table items (id text primary key, stock integer not null, revision integer not null);
  create table write_ledger (
    scope text not null, operation text not null, target text not null, answer text not null, at integer not null,
    primary key (scope, operation, target)
  );`

const sqlite = new DatabaseSync(':memory:')
sqlite.exec(schema)
afterEach(() => {
  sqlite.exec('delete from items; delete from write_ledger')
})
const seed = () => sqlite.exec("insert into items values ('i1', 10, 1)")
const stock = () => sqlite.prepare("select stock from items where id = 'i1'").get()
const records = () => sqlite.prepare('select scope, operation from write_ledger').all()

/** A server whose writer keeps a ledger with this retention, scoped by who is asking. */
const serving = (retention?: number) =>
  RemoteServer.make<string, DrizzleDatabase>({
    entities: [],
    mutations: [
      RemoteServer.write(
        Restock,
        writer<string>(Db.Item, {
          ledger: {
            table: ledgerTable,
            scope: principal => principal,
            ...(retention === undefined ? {} : { retention }),
          },
        }),
      ),
    ],
  })
const send = (
  server: ReturnType<typeof serving>,
  principal: string,
  quantity: number,
  operation?: string,
) =>
  Effect.runPromise(
    RemoteServer.handlers(server, principal)
      .FoldkitRemoteMutate({
        requestId: 'r',
        mutation: 'Restock',
        input: { id: 'i1', quantity },
        ...(operation === undefined ? {} : { operation }),
      })
      .pipe(Effect.result, Effect.provide(databaseLayer(drizzle({ client: sqlite })))),
  )

describe('A writer with a ledger', () => {
  it('lands two increments made from one read, since neither expects a revision', async () => {
    seed()
    const server = serving()
    expect((await send(server, 'ada', 5, 'op-a'))._tag).toBe('Success')
    expect((await send(server, 'ada', 3, 'op-b'))._tag).toBe('Success')
    expect(stock()).toEqual({ stock: 18 })
  })

  it('answers a retry from its record, and adds once', async () => {
    seed()
    const server = serving()
    const first = await send(server, 'ada', 5, 'op-a')
    // The answer was lost; the same operation comes again.
    const retried = await send(server, 'ada', 5, 'op-a')
    expect(retried).toMatchObject({
      _tag: 'Success',
      success: { entities: [{ id: 'i1', values: { stock: 15 } }] },
    })
    expect(retried).toEqual(first)
    expect(stock()).toEqual({ stock: 15 })
    expect(records()).toEqual([{ scope: 'ada', operation: 'op-a' }])
  })

  it('answers a retry after a later write with the row as it now is, and adds once', async () => {
    seed()
    const server = serving()
    await send(server, 'ada', 5, 'op-a')
    await send(server, 'ada', 3, 'op-b')
    // op-a's answer was lost; it comes again after op-b landed.
    expect(await send(server, 'ada', 5, 'op-a')).toMatchObject({
      _tag: 'Success',
      success: { entities: [{ id: 'i1', values: { stock: 18 } }] },
    })
    expect(stock()).toEqual({ stock: 18 })
  })

  it('records each row one operation writes, and answers no other row’s retry', async () => {
    sqlite.exec("insert into items values ('i1', 10, 1), ('i2', 10, 1)")
    const server = serving()
    const restock = (id: string, quantity: number) =>
      Effect.runPromise(
        RemoteServer.handlers(server, 'ada')
          .FoldkitRemoteMutate({
            requestId: 'r',
            mutation: 'Restock',
            input: { id, quantity },
            operation: 'transfer-1',
          })
          .pipe(Effect.result, Effect.provide(databaseLayer(drizzle({ client: sqlite })))),
      )
    // One operation moving stock between two rows: each is written once.
    await restock('i1', -4)
    await restock('i2', 4)
    await restock('i1', -4)
    const both = sqlite.prepare('select id, stock from items order by id').all()
    expect(both).toEqual([
      { id: 'i1', stock: 6 },
      { id: 'i2', stock: 14 },
    ])
    expect(records()).toHaveLength(2)
  })

  it('refuses, called directly, an increment with no revision and no ledgered operation', async () => {
    seed()
    const direct = writer<string>(Db.Item, {
      ledger: { table: ledgerTable, scope: principal => principal },
    })
    const failed = await Effect.runPromise(
      direct
        .update({
          id: 'i1',
          values: {},
          increments: { stock: 5 },
          links: {},
          expect: Option.none(),
          when: Option.none(),
          operation: Option.none(),
          principal: 'ada',
        })
        .pipe(Effect.result, Effect.provide(databaseLayer(drizzle({ client: sqlite })))),
    )
    expect(failed).toMatchObject({
      _tag: 'Failure',
      failure: {
        message:
          'Item i1: an increment with no revision is written only under a ledgered operation',
      },
    })
    expect(stock()).toEqual({ stock: 10 })
  })

  it('answers no one with another’s write: an operation id is the asker’s', async () => {
    seed()
    const server = serving()
    await send(server, 'ada', 5, 'op-a')
    await send(server, 'grace', 5, 'op-a')
    expect(stock()).toEqual({ stock: 20 })
  })

  it('takes a retry past its retention as a new operation', async () => {
    seed()
    // Every record is already past a retention that ends before it was made.
    const server = serving(-1000)
    await send(server, 'ada', 5, 'op-a')
    await send(server, 'ada', 5, 'op-a')
    expect(stock()).toEqual({ stock: 20 })
  })

  it('refuses an increment with no revision from a client that sends no operation', async () => {
    seed()
    expect(await send(serving(), 'ada', 5)).toMatchObject({
      _tag: 'Failure',
      failure: {
        message: 'Restock increments a field with no revision, so it needs an operation id',
      },
    })
    expect(stock()).toEqual({ stock: 10 })
  })

  it('refuses, where it is served, an increment with no revision over a writer with no ledger', () => {
    expect(() => RemoteServer.write(Restock, writer(Db.Item))).toThrow(
      'increments a field and expects no revision, so a retry could add twice',
    )
  })

  it('fails over a database with no transactions, rather than writing unrecorded', async () => {
    seed()
    const database = drizzle({ client: sqlite })
    const untransacted = new Proxy(database, {
      get: (target, key) => (key === 'transaction' ? undefined : Reflect.get(target, key)),
    })
    const failed = await Effect.runPromise(
      RemoteServer.handlers(serving(), 'ada')
        .FoldkitRemoteMutate({
          requestId: 'r',
          mutation: 'Restock',
          input: { id: 'i1', quantity: 5 },
          operation: 'op-a',
        })
        .pipe(Effect.result, Effect.provide(databaseLayer(untransacted))),
    )
    expect(failed).toMatchObject({
      _tag: 'Failure',
      failure: { message: "Item's ledger needs a database with transactions" },
    })
    expect(stock()).toEqual({ stock: 10 })
  })
})

describe('A writer with a ledger, on Postgres', () => {
  const pgItems = pgTable('items', {
    id: pgText('id').primaryKey(),
    stock: pgInteger('stock').notNull(),
    revision: pgInteger('revision').notNull(),
  })
  const pgLedger = pgTable(
    'write_ledger',
    {
      scope: pgText('scope').notNull(),
      operation: pgText('operation').notNull(),
      target: pgText('target').notNull(),
      answer: pgText('answer').notNull(),
      at: pgBigint('at', { mode: 'number' }).notNull(),
    },
    table => [pgPrimaryKey({ columns: [table.scope, table.operation, table.target] })],
  )
  const PgDb = bind({ Item }, { Item: { table: pgItems } })
  const pglite = new PGlite()
  beforeAll(() => pglite.waitReady, 60_000)
  afterAll(() => pglite.close())
  const server = RemoteServer.make<string, DrizzleDatabase>({
    entities: [],
    mutations: [
      RemoteServer.write(
        Restock,
        writer<string>(PgDb.Item, { ledger: { table: pgLedger, scope: principal => principal } }),
      ),
    ],
  })
  const pgSend = (quantity: number, operation: string) =>
    Effect.runPromise(
      RemoteServer.handlers(server, 'ada')
        .FoldkitRemoteMutate({
          requestId: 'r',
          mutation: 'Restock',
          input: { id: 'i1', quantity },
          operation,
        })
        .pipe(Effect.result, Effect.provide(databaseLayer(drizzlePg({ client: pglite })))),
    )

  it('lands concurrent increments, and answers a retry from its record', async () => {
    await pglite.exec(`
      create table items (id text primary key, stock integer not null, revision integer not null);
      create table write_ledger (
        scope text not null, operation text not null, target text not null, answer text not null, at bigint not null,
        primary key (scope, operation, target)
      );
      insert into items values ('i1', 10, 1);`)
    expect((await pgSend(5, 'op-a'))._tag).toBe('Success')
    expect((await pgSend(3, 'op-b'))._tag).toBe('Success')
    expect((await pgSend(5, 'op-a'))._tag).toBe('Success')
    const rows = await pglite.query('select stock from items')
    expect(rows.rows).toEqual([{ stock: 18 }])
    const recorded = await pglite.query('select operation from write_ledger order by operation')
    expect(recorded.rows).toEqual([{ operation: 'op-a' }, { operation: 'op-b' }])
  })
})
