/**
 * The server's half: the tables, how a guard's body is decided, and guarded
 * writers pinned to the revision their rules were decided over, one of them
 * keeping a ledger of the writes it lands.
 */
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Option } from 'effect'
import { GuardDrizzle } from 'foldkit-guard/drizzle'
import { GuardServer } from 'foldkit-guard/server'
import { Remote } from 'foldkit-remote'
import { bind, invariantChecks, writer, type DrizzleDatabase } from 'foldkit-remote-drizzle'
import { RemoteServer } from 'foldkit-remote-server'
import { Product, Publish, Rename, Restock, Revert, Sell, Shop, type User } from './domain.js'

export const products = sqliteTable('products', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  name: text('name').notNull(),
  status: text('status').notNull(),
  stock: integer('stock').notNull(),
  reserved: integer('reserved').notNull(),
  revision: integer('revision').notNull(),
})

/** Each write the ledgered writer landed, by whose operation it was. */
export const ledger = sqliteTable(
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

// Every guard is a row guard, decided in SQL: there is no principal guard to implement.
export const Policy = Shop.implement({})

const Db = bind(
  { Product },
  { Product: { table: products, visible: GuardDrizzle.visible(Policy, [Product]).Product } },
)

// The invariants as constraints too, so raw SQL is held to them as the writer is.
export const schema = `
  create table products (
    id text primary key, owner_id text not null, name text not null,
    status text not null, stock integer not null, reserved integer not null,
    revision integer not null,
    ${invariantChecks(Db.Product)
      .map(check => check.constraint)
      .join(',\n    ')}
  );
  create table write_ledger (
    scope text not null, operation text not null, target text not null, answer text not null, at integer not null,
    primary key (scope, operation, target)
  )`

// Each update and delete lands only on the revision its rules were decided over.
const guarded = GuardServer.writer(Product, Policy, writer(Db.Product), { revision: 'revision' })

// The same, recording each update under its operation, scoped to who asked.
const ledgered = GuardServer.writer(
  Product,
  Policy,
  writer<Option.Option<User>>(Db.Product, {
    ledger: {
      table: ledger,
      scope: principal => Option.match(principal, { onNone: () => '', onSome: user => user.id }),
    },
  }),
  { revision: 'revision' },
)

export const server = RemoteServer.make<Option.Option<User>, DrizzleDatabase>({
  entities: [],
  mutations: [
    RemoteServer.write(Rename, guarded),
    RemoteServer.write(Publish, guarded),
    RemoteServer.write(Revert, guarded),
    RemoteServer.write(Restock, guarded),
    RemoteServer.write(Sell, ledgered),
  ],
})

// At startup: refuses a write past its rules or reading a hidden member; warns if unpinned.
GuardServer.validate(Policy, {
  entities: [Product],
  domain: Remote.define({ entities: [Product] }),
  server,
})
