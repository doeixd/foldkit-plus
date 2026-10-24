/**
 * The server's half: the table, how a guard's body is decided, and one
 * guarded writer pinned to the revision its rules were decided over.
 */
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Option } from 'effect'
import { GuardDrizzle } from 'foldkit-guard/drizzle'
import { GuardServer } from 'foldkit-guard/server'
import { Remote } from 'foldkit-remote'
import { bind, writer, type DrizzleDatabase } from 'foldkit-remote-drizzle'
import { RemoteServer } from 'foldkit-remote-server'
import { Product, Publish, Rename, Restock, Shop, type User } from './domain.js'

export const products = sqliteTable('products', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  name: text('name').notNull(),
  status: text('status').notNull(),
  stock: integer('stock').notNull(),
  revision: integer('revision').notNull(),
})

export const schema = `
  create table products (
    id text primary key, owner_id text not null, name text not null,
    status text not null, stock integer not null, revision integer not null
  )`

// Every guard is a row guard, decided in SQL: there is no principal guard to implement.
export const Policy = Shop.implement({})

const Db = bind(
  { Product },
  { Product: { table: products, visible: GuardDrizzle.visible(Policy, [Product]).Product } },
)

// Each update and delete lands only on the revision its rules were decided over.
const guarded = GuardServer.writer(Product, Policy, writer(Db.Product), { revision: 'revision' })

export const server = RemoteServer.make<Option.Option<User>, DrizzleDatabase>({
  entities: [],
  mutations: [
    RemoteServer.write(Rename, guarded),
    RemoteServer.write(Publish, guarded),
    RemoteServer.write(Restock, guarded),
  ],
})

// At startup: refuses a write past its rules or reading a hidden member; warns if unpinned.
GuardServer.validate(Policy, {
  entities: [Product],
  domain: Remote.define({ entities: [Product] }),
  server,
})
