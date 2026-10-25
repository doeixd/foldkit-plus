// @vitest-environment node
/**
 * Invariants under a guard: authorization and validity are separate, so
 * neither grants the other; the rules speak first; and an invariant over a
 * member a Read rule hides is enforced without saying which one failed.
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
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
  reserved: integer('reserved').notNull(),
  cost: integer('cost').notNull(),
  revision: integer('revision').notNull(),
})
const Fields = Entity.define(
  'Item',
  Schema.Struct({
    id: Schema.String,
    ownerId: Schema.String,
    stock: Schema.Number,
    reserved: Schema.Number,
    cost: Schema.Number,
    revision: Schema.Number,
  }),
)
const G = Guards.declare(
  'Shop',
  User,
  guard => ({
    isManager: guard.principal(),
    isOwner: guard.row(Fields, p => Expr.eq(Fields.fields.ownerId, p.id)),
  }),
  { key: user => user.id, unguarded: 'allow' },
)
const Item = Fields.pipe(
  Guards.attach(G, {
    row: { Read: [G.isOwner, G.isManager], Update: [G.isOwner, G.isManager] },
    // A member sees no cost.
    members: { cost: { Read: [G.isManager] } },
  }),
  Entity.invariant('reservedWithinStock', ({ after }) => Expr.lte(after.reserved, after.stock), {
    message: 'Reserved stock cannot exceed the stock',
    path: ['reserved'],
  }),
  Entity.invariant('costNotNegative', ({ after }) => Expr.gte(after.cost, 0), {
    message: 'The cost cannot be negative',
  }),
  Entity.invariant(
    'costAboveReserved',
    ({ before, after }) => Expr.gt(after.cost, Expr.field(before.reserved)),
    { message: 'The cost must stay above the reserved count' },
  ),
)
const Policy = G.implement({
  isManager: principal => Option.exists(principal, user => user.role === 'manager'),
})
const Db = bind(
  { Item },
  { Item: { table: items, visible: GuardDrizzle.visible(Policy, [Item]).Item } },
)
const SetStock = Mutation.write(
  'SetStock',
  Write.update(Entity.input(Item, Schema.Struct({ id: Schema.String, stock: Schema.Number })), {
    id: 'id',
  }),
)
const SetCost = Mutation.write(
  'SetCost',
  Write.update(Entity.input(Item, Schema.Struct({ id: Schema.String, cost: Schema.Number })), {
    id: 'id',
  }),
)

const ada = Option.some<User>({ id: 'ada', role: 'member' })
const grace = Option.some<User>({ id: 'grace', role: 'member' })
const mo = Option.some<User>({ id: 'mo', role: 'manager' })

const open = () => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    create table items (id text primary key, owner_id text not null, stock integer not null,
      reserved integer not null, cost integer not null, revision integer not null);
    insert into items values ('i1', 'ada', 10, 5, 2, 1);
  `)
  const guarded = GuardServer.writer(Item, Policy, writer(Db.Item), { revision: 'revision' })
  const server = RemoteServer.make<Option.Option<User>, DrizzleDatabase>({
    entities: [],
    mutations: [RemoteServer.write(SetStock, guarded), RemoteServer.write(SetCost, guarded)],
  })
  const send = (principal: Option.Option<User>, mutation: string, input: unknown) =>
    Effect.runPromise(
      RemoteServer.handlers(server, principal)
        .FoldkitRemoteMutate({ requestId: 'r', mutation, input })
        .pipe(Effect.result, Effect.provide(databaseLayer(drizzle({ client: sqlite })))),
    )
  const row = () => sqlite.prepare('select stock, cost from items').get()
  return { send, row }
}

describe('A guarded write over an Entity with invariants', () => {
  it('is refused as invalid for someone the rules let write: authority does not bypass validity', async () => {
    const { send, row } = open()
    for (const principal of [ada, mo]) {
      expect(await send(principal, 'SetStock', { id: 'i1', stock: 3 })).toMatchObject({
        failure: {
          refusal: {
            _tag: 'Invalid',
            rule: 'reservedWithinStock',
            message: 'Reserved stock cannot exceed the stock',
            path: ['reserved'],
          },
        },
      })
    }
    expect(row()).toEqual({ stock: 10, cost: 2 })
  })

  it('is forbidden for someone the rules do not let write, valid or not: validity grants nothing', async () => {
    const { send, row } = open()
    for (const stock of [3, 8]) {
      expect(await send(grace, 'SetStock', { id: 'i1', stock })).toMatchObject({
        failure: { _tag: 'Forbidden' },
      })
    }
    expect(row()).toEqual({ stock: 10, cost: 2 })
  })

  it('names no invariant over a member a Read rule hides, and still enforces it', async () => {
    const { send, row } = open()
    expect(await send(ada, 'SetCost', { id: 'i1', cost: -1 })).toMatchObject({
      failure: {
        refusal: { _tag: 'Invalid', rule: null, message: 'The row would be invalid', path: [] },
      },
    })
    expect(row()).toEqual({ stock: 10, cost: 2 })
    expect((await send(ada, 'SetCost', { id: 'i1', cost: 6 }))._tag).toBe('Success')
  })

  it('names no transition over a member a Read rule hides, and still enforces it', async () => {
    const { send, row } = open()
    // 4 is no negative cost, and no more than the 5 reserved.
    expect(await send(ada, 'SetCost', { id: 'i1', cost: 4 })).toMatchObject({
      failure: {
        refusal: { _tag: 'Invalid', rule: null, message: 'The row would be invalid', path: [] },
      },
    })
    expect(row()).toEqual({ stock: 10, cost: 2 })
  })
})
