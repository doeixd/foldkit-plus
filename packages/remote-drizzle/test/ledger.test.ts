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
import { Entity, Expr, Write } from 'foldkit-entity'
import { Mutation } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { bind, databaseLayer, writer, type DrizzleDatabase } from '../src/index.js'

const Item = Entity.define(
  'Item',
  Schema.Struct({ id: Schema.String, stock: Schema.Int, revision: Schema.Number }),
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
    request: text('request'),
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
// Another mutation whose input is Restock's.
const Return = Mutation.write(
  'Return',
  Write.update(
    Entity.input(Item, Schema.Struct({ id: Schema.String, quantity: Schema.Int }), {
      quantity: Entity.unmapped,
    }),
    { id: 'id', increment: { stock: 'quantity' } },
  ),
)
// Sets the stock outright, at a revision.
const SetStock = Mutation.write(
  'SetStock',
  Write.update(
    Entity.input(
      Item,
      Schema.Struct({ id: Schema.String, stock: Schema.Int, revision: Schema.Number }),
    ),
    { id: 'id', expect: 'revision' },
  ),
)
// Empties a row that holds stock: its precondition says which rows it starts from.
const Clear = Mutation.write(
  'Clear',
  Write.update(Entity.input(Item, Schema.Struct({ id: Schema.String, stock: Schema.Int })), {
    id: 'id',
    when: () => Expr.gt(Item.fields.stock, 0),
  }),
)
const Create = Mutation.write(
  'CreateItem',
  Write.insert(
    Entity.input(
      Item,
      Schema.Struct({ id: Schema.String, stock: Schema.Int, revision: Schema.Number }),
    ),
    { id: 'id' },
  ),
)

const schema = `
  create table items (id text primary key, stock integer not null, revision integer not null);
  create table write_ledger (
    scope text not null, operation text not null, target text not null, answer text not null, at integer not null, request text,
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
const serving = (retention?: number) => {
  const ledgered = writer<string>(Db.Item, {
    ledger: {
      table: ledgerTable,
      scope: principal => principal,
      ...(retention === undefined ? {} : { retention }),
    },
  })
  return RemoteServer.make<string, DrizzleDatabase>({
    entities: [],
    mutations: [
      RemoteServer.write(Restock, ledgered),
      RemoteServer.write(Return, ledgered),
      RemoteServer.write(SetStock, ledgered),
      RemoteServer.write(Clear, ledgered),
      RemoteServer.write(Create, ledgered),
    ],
  })
}
/** A create of `i2` holding `stock`, asked by `principal` under `operation`. */
const create = (
  server: ReturnType<typeof serving>,
  principal: string,
  stock: number,
  operation: string,
) =>
  Effect.runPromise(
    RemoteServer.handlers(server, principal)
      .FoldkitRemoteMutate({
        requestId: 'r',
        mutation: 'CreateItem',
        input: { id: 'i2', stock, revision: 1 },
        operation,
      })
      .pipe(Effect.result, Effect.provide(databaseLayer(drizzle({ client: sqlite })))),
  )
/** `mutation` with `input`, asked by ada under `operation`. */
const mutate = (
  server: ReturnType<typeof serving>,
  mutation: string,
  input: unknown,
  operation: string,
) =>
  Effect.runPromise(
    RemoteServer.handlers(server, 'ada')
      .FoldkitRemoteMutate({ requestId: 'r', mutation, input, operation })
      .pipe(Effect.result, Effect.provide(databaseLayer(drizzle({ client: sqlite })))),
  )
/** The failure for `operation`'s id sent again with another request. */
const reused = (operation: string) => ({
  _tag: 'Failure',
  failure: {
    message: `Item i1: operation "${operation}" was recorded for another request; a retry sends the same mutation, keys and input`,
  },
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
  it('refuses an increment of a real number that expects no revision, where it is served', () => {
    // Floating-point addition does not associate, so two concurrent sums could land as two results.
    const Real = Entity.define(
      'Item',
      Schema.Struct({ id: Schema.String, stock: Schema.Number, revision: Schema.Number }),
    )
    const Topple = Mutation.write(
      'Topple',
      Write.update(
        Entity.input(Real, Schema.Struct({ id: Schema.String, quantity: Schema.Number }), {
          quantity: Entity.unmapped,
        }),
        { id: 'id', increment: { stock: 'quantity' } },
      ),
    )
    const ledgered = writer<string>(bind({ Real }, { Real: { table: items } }).Real, {
      ledger: { table: ledgerTable, scope: principal => principal },
    })
    expect(() => RemoteServer.write(Topple, ledgered)).toThrow(
      'write "Topple" increments "stock", a real number, and expects no revision',
    )
  })

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

  it('refuses an operation id sent again with another request, and writes nothing', async () => {
    seed()
    const server = serving()
    expect((await send(server, 'ada', 5, 'op-a'))._tag).toBe('Success')
    // Another amount, another mutation with the same input, and another altogether.
    expect(await send(server, 'ada', 7, 'op-a')).toMatchObject(reused('op-a'))
    expect(await mutate(server, 'Return', { id: 'i1', quantity: 5 }, 'op-a')).toMatchObject(
      reused('op-a'),
    )
    expect(
      await mutate(server, 'SetStock', { id: 'i1', stock: 100, revision: 1 }, 'op-a'),
    ).toMatchObject(reused('op-a'))
    expect(stock()).toEqual({ stock: 15 })
    // The request it was recorded for is still its retry.
    expect((await send(server, 'ada', 5, 'op-a'))._tag).toBe('Success')
    expect(stock()).toEqual({ stock: 15 })
  })

  it('answers as a retry a record made before the ledger kept requests', async () => {
    seed()
    const server = serving()
    await send(server, 'ada', 5, 'op-a')
    sqlite.exec('update write_ledger set request = null')
    expect((await send(server, 'ada', 5, 'op-a'))._tag).toBe('Success')
    expect(stock()).toEqual({ stock: 15 })
  })

  it('judges a new operation the row already agrees with by its precondition, not as a retry', async () => {
    sqlite.exec("insert into items values ('i1', 0, 1)")
    expect(await mutate(serving(), 'Clear', { id: 'i1', stock: 0 }, 'op-new')).toMatchObject({
      _tag: 'Failure',
      failure: { refusal: { _tag: 'Unmet' } },
    })
    expect(records()).toEqual([])
  })

  it('takes a new operation one revision behind for a conflict, though it sets what the row holds', async () => {
    seed()
    const server = serving()
    const set = { id: 'i1', stock: 20, revision: 1 }
    expect((await mutate(server, 'SetStock', set, 'op-x'))._tag).toBe('Success')
    // Another client, from the same read, asks the same: not op-x's retry.
    expect(await mutate(server, 'SetStock', set, 'op-y')).toMatchObject({
      _tag: 'Failure',
      failure: { refusal: { _tag: 'Conflict' } },
    })
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
          assignments: {},
          links: {},
          expect: Option.none(),
          when: Option.none(),
          operation: Option.none(),
          request: 'Restock',
          principal: 'ada',
        })
        .pipe(Effect.result, Effect.provide(databaseLayer(drizzle({ client: sqlite })))),
    )
    expect(failed).toMatchObject({
      _tag: 'Failure',
      failure: {
        message:
          'Item i1: an increment or computation with no revision is written only under a ledgered operation',
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
        message: 'Restock moves a field with no revision, so it needs an operation id',
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

  it('answers a retried create from its record, and every other create of the id alike', async () => {
    const server = serving()
    const first = await create(server, 'ada', 4, 'op-c')
    expect(first).toMatchObject({
      _tag: 'Success',
      success: { entities: [{ id: 'i2', values: { stock: 4 } }] },
    })
    // The answer was lost; the same operation comes again.
    expect(await create(server, 'ada', 4, 'op-c')).toEqual(first)
    // Not that operation, or not that asker's: the id is taken, whatever it proposes.
    const taken = await create(server, 'ada', 4, 'op-d')
    expect(taken).toMatchObject({
      _tag: 'Failure',
      failure: {
        message: 'Item i2 is already taken',
        refusal: { _tag: 'Taken', entity: 'Item', id: 'i2' },
      },
    })
    expect(await create(server, 'ada', 9, 'op-d')).toEqual(taken)
    expect(await create(server, 'grace', 4, 'op-c')).toEqual(taken)
    expect(sqlite.prepare("select stock from items where id = 'i2'").all()).toEqual([{ stock: 4 }])
    expect(records()).toEqual([{ scope: 'ada', operation: 'op-c' }])
  })

  it('answers a retried create with the row as it now is', async () => {
    const server = serving()
    await create(server, 'ada', 4, 'op-c')
    await Effect.runPromise(
      RemoteServer.handlers(server, 'ada')
        .FoldkitRemoteMutate({
          requestId: 'r',
          mutation: 'Restock',
          input: { id: 'i2', quantity: 3 },
          operation: 'op-r',
        })
        .pipe(Effect.provide(databaseLayer(drizzle({ client: sqlite })))),
    )
    expect(await create(server, 'ada', 4, 'op-c')).toMatchObject({
      _tag: 'Success',
      success: { entities: [{ id: 'i2', values: { stock: 7 } }] },
    })
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
      request: pgText('request'),
    },
    table => [pgPrimaryKey({ columns: [table.scope, table.operation, table.target] })],
  )
  const PgDb = bind({ Item }, { Item: { table: pgItems } })
  // Started here, not as the describe is collected: its start holds the thread
  // for seconds, and would land inside whichever SQLite test above was running.
  let pglite: PGlite
  beforeAll(async () => {
    pglite = await PGlite.create()
  }, 60_000)
  afterAll(() => pglite.close())
  // Registered when a test runs, so a registration that throws fails that test, not the file.
  const server = () => {
    const ledgered = writer<string>(PgDb.Item, {
      ledger: { table: pgLedger, scope: principal => principal },
    })
    return RemoteServer.make<string, DrizzleDatabase>({
      entities: [],
      mutations: [RemoteServer.write(Restock, ledgered), RemoteServer.write(Create, ledgered)],
    })
  }
  const pgSend = (quantity: number, operation: string) =>
    Effect.runPromise(
      RemoteServer.handlers(server(), 'ada')
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
        scope text not null, operation text not null, target text not null, answer text not null, at bigint not null, request text,
        primary key (scope, operation, target)
      );
      insert into items values ('i1', 10, 1);`)
    expect((await pgSend(5, 'op-a'))._tag).toBe('Success')
    expect((await pgSend(3, 'op-b'))._tag).toBe('Success')
    expect((await pgSend(5, 'op-a'))._tag).toBe('Success')
    expect(await pgSend(7, 'op-a')).toMatchObject(reused('op-a'))
    const rows = await pglite.query('select stock from items')
    expect(rows.rows).toEqual([{ stock: 18 }])
    const recorded = await pglite.query('select operation from write_ledger order by operation')
    expect(recorded.rows).toEqual([{ operation: 'op-a' }, { operation: 'op-b' }])
  })

  it('answers a retried create from its record, and every other create of the id alike', async () => {
    const pgCreate = (principal: string, operation: string) =>
      Effect.runPromise(
        RemoteServer.handlers(server(), principal)
          .FoldkitRemoteMutate({
            requestId: 'r',
            mutation: 'CreateItem',
            input: { id: 'i2', stock: 4, revision: 1 },
            operation,
          })
          .pipe(Effect.result, Effect.provide(databaseLayer(drizzlePg({ client: pglite })))),
      )
    const first = await pgCreate('ada', 'op-c')
    expect(first._tag).toBe('Success')
    expect(await pgCreate('ada', 'op-c')).toEqual(first)
    const taken = await pgCreate('ada', 'op-d')
    expect(taken).toMatchObject({
      _tag: 'Failure',
      failure: {
        message: 'Item i2 is already taken',
        refusal: { _tag: 'Taken', entity: 'Item', id: 'i2' },
      },
    })
    expect(await pgCreate('grace', 'op-c')).toEqual(taken)
    const rows = await pglite.query("select stock from items where id = 'i2'")
    expect(rows.rows).toEqual([{ stock: 4 }])
  })
})
