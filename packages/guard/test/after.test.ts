// @vitest-environment node
/**
 * An update's member and link rules, held over the row before and over the
 * row it leaves with that one change undone, over real SQLite: one write
 * setting two members, or a member and a link, cannot reach a row that each
 * change alone is refused, and a rule reading its own member still allows it.
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Option, Schema } from 'effect'
import { Entity, Expr, Relation, Write } from 'foldkit-entity'
import { Mutation } from 'foldkit-remote'
import { bind, databaseLayer, writer, type DrizzleDatabase } from 'foldkit-remote-drizzle'
import { RemoteServer } from 'foldkit-remote-server'
import { describe, expect, it } from 'vitest'
import { GuardDrizzle } from '../src/drizzle.js'
import { Guards } from '../src/index.js'
import { GuardServer } from '../src/server.js'

const User = Schema.Struct({ id: Schema.String })
type User = typeof User.Type

const accounts = sqliteTable('accounts', { id: text('id').primaryKey() })
const orders = sqliteTable('orders', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  tier: text('tier').notNull(),
  approved: text('approved').notNull(),
  status: text('status').notNull(),
  accountId: text('account_id'),
})

const Account = Entity.define('Account', Schema.Struct({ id: Schema.String }))
const Related = Entity.relate(
  {
    Account,
    Order: Entity.define(
      'Order',
      Schema.Struct({
        id: Schema.String,
        ownerId: Schema.String,
        tier: Schema.String,
        approved: Schema.String,
        status: Schema.String,
      }),
    ),
  },
  { Order: { account: Relation.one(Account, { optional: true }) } },
)
const Fields = Related.Order.fields

const G = Guards.declare(
  'Orders',
  User,
  guard => ({
    isOwner: guard.row(Related.Order, p => Expr.eq(Fields.ownerId, p.id)),
    notLarge: guard.row(Related.Order, () => Expr.in(Fields.tier, ['small', 'medium'])),
    notApproved: guard.row(Related.Order, () => Expr.in(Fields.approved, ['no', 'pending'])),
    isDraft: guard.row(Related.Order, () => Expr.eq(Fields.status, 'draft')),
  }),
  { key: user => user.id, unguarded: 'allow' },
)
// A large order is never approved: approving needs it not large, enlarging needs it not
// approved, and so does billing it to an account. Only one not large is taken off its
// account, and only a draft changes its status.
const Order = Related.Order.pipe(
  Guards.attach(G, {
    row: { Read: [G.isOwner], Update: [G.isOwner] },
    members: {
      approved: { Update: [G.notLarge] },
      tier: { Update: [G.notApproved] },
      status: { Update: [G.isDraft] },
    },
    relations: { account: { Link: [G.notApproved], Unlink: [G.notLarge] } },
  }),
)
const Policy = G.implement({})
const Db = bind(
  { Order, Account },
  {
    Order: {
      table: orders,
      relations: { account: { field: orders.accountId } },
      visible: GuardDrizzle.visible(Policy, [Order]).Order,
    },
    Account: { table: accounts },
  },
)

const Change = Mutation.write(
  'ChangeOrder',
  Write.update(
    Entity.input(
      Order,
      Schema.Struct({
        id: Schema.String,
        tier: Schema.String,
        approved: Schema.String,
        status: Schema.String,
        accountId: Schema.NullOr(Schema.String),
      }),
      { accountId: Relation.input(Order.relations.account) },
    ),
    { id: 'id' },
  ),
)
const server = RemoteServer.make<Option.Option<User>, DrizzleDatabase>({
  entities: [],
  mutations: [RemoteServer.write(Change, GuardServer.writer(Order, Policy, writer(Db.Order)))],
})
const ada = Option.some<User>({ id: 'ada' })

const open = () => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    create table accounts (id text primary key);
    create table orders (
      id text primary key, owner_id text not null, tier text not null, approved text not null,
      status text not null, account_id text
    );
    insert into accounts values ('a1');
    insert into orders values ('o1', 'ada', 'small', 'no', 'draft', null);
  `)
  const layer = databaseLayer(drizzle({ client: sqlite }))
  /** A change of `o1`, writing only `keys`. */
  const change = (values: {
    readonly tier?: string
    readonly approved?: string
    readonly status?: string
    readonly accountId?: string | null
  }) =>
    Effect.runPromise(
      RemoteServer.handlers(server, ada)
        .FoldkitRemoteMutate({
          requestId: 'r',
          mutation: 'ChangeOrder',
          input: {
            id: 'o1',
            tier: 'small',
            approved: 'no',
            status: 'draft',
            accountId: null,
            ...values,
          },
          keys: Object.keys(values),
        })
        .pipe(Effect.result, Effect.provide(layer)),
    )
  const row = () => sqlite.prepare("select * from orders where id = 'o1'").get()
  return { change, row }
}

const forbidden = { _tag: 'Failure', failure: { _tag: 'Forbidden' } }

describe('GuardServer.writer over an update setting two things at once', () => {
  it('refuses each change after the other, in either order', async () => {
    const approving = open()
    expect(await approving.change({ approved: 'yes' })).toMatchObject({ _tag: 'Success' })
    expect(await approving.change({ tier: 'large' })).toMatchObject(forbidden)
    const enlarging = open()
    expect(await enlarging.change({ tier: 'large' })).toMatchObject({ _tag: 'Success' })
    expect(await enlarging.change({ approved: 'yes' })).toMatchObject(forbidden)
  })

  it('refuses two members set in one write, where the row it leaves breaks a member’s rule', async () => {
    const { change, row } = open()
    expect(await change({ tier: 'large', approved: 'yes' })).toMatchObject(forbidden)
    expect(row()).toMatchObject({ tier: 'small', approved: 'no' })
  })

  it('refuses a member set beside a link, where the row it leaves breaks the link’s rule', async () => {
    const { change, row } = open()
    expect(await change({ approved: 'yes', accountId: 'a1' })).toMatchObject(forbidden)
    expect(row()).toMatchObject({ approved: 'no', account_id: null })
    // Each alone is allowed.
    expect(await change({ accountId: 'a1' })).toMatchObject({ _tag: 'Success' })
  })

  it('allows a change a rule over its own member allows, which the row after no longer meets', async () => {
    const { change, row } = open()
    expect(await change({ status: 'sent' })).toMatchObject({ _tag: 'Success' })
    expect(row()).toMatchObject({ status: 'sent' })
    expect(await change({ status: 'draft' })).toMatchObject(forbidden)
  })

  it('allows two members set together only where each change is allowed given the other', async () => {
    const both = open()
    expect(await both.change({ tier: 'medium', approved: 'pending' })).toMatchObject({
      _tag: 'Success',
    })
    expect(both.row()).toMatchObject({ tier: 'medium', approved: 'pending' })
    // Each change here is allowed alone, but not given the other.
    for (const [alone, other] of [
      [{ tier: 'large' }, { approved: 'pending' }],
      [{ approved: 'yes' }, { tier: 'medium' }],
    ] as const) {
      expect(await open().change(alone)).toMatchObject({ _tag: 'Success' })
      expect(await open().change(other)).toMatchObject({ _tag: 'Success' })
      const { change, row } = open()
      expect(await change({ ...alone, ...other })).toMatchObject(forbidden)
      expect(row()).toMatchObject({ tier: 'small', approved: 'no' })
    }
  })

  it('judges an unlink over the row before alone, which the row after no longer points from', async () => {
    const { change, row } = open()
    await change({ accountId: 'a1' })
    // Small as it is, it may leave its account, though the same write makes it large.
    expect(await change({ tier: 'large', accountId: null })).toMatchObject({ _tag: 'Success' })
    expect(row()).toMatchObject({ tier: 'large', account_id: null })
  })
})
