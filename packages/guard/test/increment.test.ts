// @vitest-environment node
/**
 * A guarded write that increments a field: its rules hold over the sum the
 * writer will store, and the field needs its member's Update rule.
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Option, Schema } from 'effect'
import { Entity, Expr, Write } from 'foldkit-entity'
import { Mutation } from 'foldkit-remote'
import { bind, databaseLayer, writer, type DrizzleDatabase } from 'foldkit-remote-drizzle'
import { RemoteServer } from 'foldkit-remote-server'
import { describe, expect, it } from 'vitest'
import { GuardDrizzle } from '../src/drizzle.js'
import { Guards } from '../src/index.js'
import { GuardServer } from '../src/server.js'

const User = Schema.Struct({ id: Schema.String, role: Schema.Literals(['member', 'manager']) })
type User = typeof User.Type

const items = sqliteTable('items', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  stock: integer('stock').notNull(),
  revision: integer('revision').notNull(),
})
const Fields = Entity.define(
  'Item',
  Schema.Struct({
    id: Schema.String,
    ownerId: Schema.String,
    stock: Schema.Number,
    revision: Schema.Number,
  }),
)
const G = Guards.declare(
  'Stock',
  User,
  guard => ({
    isManager: guard.principal(),
    isOwner: guard.row(Fields, p => Expr.eq(Fields.fields.ownerId, p.id)),
    inStock: guard.row(Fields, () => Expr.gte(Fields.fields.stock, 0)),
  }),
  { key: user => user.id, unguarded: 'allow' },
)
const Item = Fields.pipe(
  Guards.attach(G, {
    // Held over the row as it is and as it would be: a sale past zero moves it out of reach.
    row: { Read: [G.isOwner], Update: [Guards.all(G.isOwner, G.inStock)] },
    members: { stock: { Update: [G.isManager] } },
  }),
)
const Policy = G.implement({
  isManager: principal => Option.exists(principal, user => user.role === 'manager'),
})
const Db = bind(
  { Item },
  { Item: { table: items, visible: GuardDrizzle.visible(Policy, [Item]).Item } },
)
const Adjust = Mutation.write(
  'Adjust',
  Write.update(
    Entity.input(
      Item,
      Schema.Struct({ id: Schema.String, revision: Schema.Number, by: Schema.Number }),
      { by: Entity.unmapped },
    ),
    { id: 'id', expect: 'revision', increment: { stock: 'by' } },
  ),
)

const mo = Option.some<User>({ id: 'mo', role: 'manager' })
const ada = Option.some<User>({ id: 'ada', role: 'member' })

const open = () => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    create table items (id text primary key, owner_id text not null, stock integer not null, revision integer not null);
    insert into items values ('i1', 'mo', 3, 1), ('i2', 'ada', 3, 1);
  `)
  const server = RemoteServer.make<Option.Option<User>, DrizzleDatabase>({
    entities: [],
    mutations: [
      RemoteServer.write(
        Adjust,
        GuardServer.writer(Item, Policy, writer(Db.Item), { revision: 'revision' }),
      ),
    ],
  })
  const adjust = (principal: Option.Option<User>, input: unknown) =>
    Effect.runPromise(
      RemoteServer.handlers(server, principal)
        .FoldkitRemoteMutate({ requestId: 'r', mutation: 'Adjust', input })
        .pipe(Effect.result, Effect.provide(databaseLayer(drizzle({ client: sqlite })))),
    )
  const stock = (id: string) => sqlite.prepare('select stock from items where id = ?').get(id)
  return { adjust, stock }
}

describe('GuardServer.writer over a write that increments a field', () => {
  it('holds its rules over the sum the writer will store', async () => {
    const { adjust, stock } = open()
    expect((await adjust(mo, { id: 'i1', revision: 1, by: -3 }))._tag).toBe('Success')
    expect(stock('i1')).toEqual({ stock: 0 })
    // One more would leave less than none: the rule over the row as it would be refuses it.
    expect(await adjust(mo, { id: 'i1', revision: 2, by: -1 })).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'Forbidden' },
    })
    expect(stock('i1')).toEqual({ stock: 0 })
  })

  it('needs the incremented member’s Update rule, as a written one does', async () => {
    const { adjust, stock } = open()
    // ada owns i2, but only a manager may change its stock.
    expect(await adjust(ada, { id: 'i2', revision: 1, by: 1 })).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'Forbidden' },
    })
    expect(stock('i2')).toEqual({ stock: 3 })
  })
})

describe('GuardServer.writer over a writer with a ledger', () => {
  const ledger = sqliteTable(
    'write_ledger',
    {
      scope: text('scope').notNull(),
      operation: text('operation').notNull(),
      answer: text('answer').notNull(),
      at: integer('at').notNull(),
    },
    table => [primaryKey({ columns: [table.scope, table.operation] })],
  )
  // No revision expected: the ledger is what keeps a retry from adding twice.
  const Bump = Mutation.write(
    'Bump',
    Write.update(
      Entity.input(Item, Schema.Struct({ id: Schema.String, by: Schema.Number }), {
        by: Entity.unmapped,
      }),
      { id: 'id', increment: { stock: 'by' } },
    ),
  )

  it('answers a retry as it landed, though the row has since moved out of its writer’s reach', async () => {
    const sqlite = new DatabaseSync(':memory:')
    sqlite.exec(`
      create table items (id text primary key, owner_id text not null, stock integer not null, revision integer not null);
      create table write_ledger (scope text not null, operation text not null, answer text not null, at integer not null, primary key (scope, operation));
      insert into items values ('i1', 'mo', 3, 1);
    `)
    const server = RemoteServer.make<Option.Option<User>, DrizzleDatabase>({
      entities: [],
      mutations: [
        RemoteServer.write(
          Bump,
          GuardServer.writer(
            Item,
            Policy,
            writer<Option.Option<User>>(Db.Item, {
              ledger: {
                table: ledger,
                scope: principal =>
                  Option.match(principal, { onNone: () => '', onSome: user => user.id }),
              },
            }),
            { revision: 'revision' },
          ),
        ),
      ],
    })
    const bump = (operation: string) =>
      Effect.runPromise(
        RemoteServer.handlers(server, mo)
          .FoldkitRemoteMutate({
            requestId: 'r',
            mutation: 'Bump',
            input: { id: 'i1', by: 2 },
            operation,
          })
          .pipe(Effect.result, Effect.provide(databaseLayer(drizzle({ client: sqlite })))),
      )
    expect((await bump('op-1'))._tag).toBe('Success')
    sqlite.exec("update items set owner_id = 'ada' where id = 'i1'")
    // The retry was decided when it landed; deciding it again would refuse a write that happened.
    expect((await bump('op-1'))._tag).toBe('Success')
    // A new operation is decided now, and refused.
    expect(await bump('op-2')).toMatchObject({ _tag: 'Failure', failure: { _tag: 'Forbidden' } })
    expect(sqlite.prepare("select stock from items where id = 'i1'").get()).toEqual({ stock: 5 })
  })

  it('refuses an increment with no revision through an unpinned writer, whose rules would judge a stale sum', async () => {
    const sqlite = new DatabaseSync(':memory:')
    sqlite.exec(`
      create table items (id text primary key, owner_id text not null, stock integer not null, revision integer not null);
      create table write_ledger (scope text not null, operation text not null, answer text not null, at integer not null, primary key (scope, operation));
      insert into items values ('i1', 'mo', 3, 1);
    `)
    const server = RemoteServer.make<Option.Option<User>, DrizzleDatabase>({
      entities: [],
      mutations: [
        RemoteServer.write(
          Bump,
          GuardServer.writer(
            Item,
            Policy,
            writer<Option.Option<User>>(Db.Item, {
              ledger: { table: ledger, scope: () => 'mo' },
            }),
          ),
        ),
      ],
    })
    const failed = await Effect.runPromise(
      RemoteServer.handlers(server, mo)
        .FoldkitRemoteMutate({
          requestId: 'r',
          mutation: 'Bump',
          input: { id: 'i1', by: 2 },
          operation: 'op',
        })
        .pipe(Effect.result, Effect.provide(databaseLayer(drizzle({ client: sqlite })))),
    )
    expect(JSON.stringify(failed)).toContain('its writer pins none')
    expect(sqlite.prepare("select stock from items where id = 'i1'").get()).toEqual({ stock: 3 })
  })
})
