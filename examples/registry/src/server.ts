/**
 * The server's interpretation of the domain: a `products` table in an
 * in-memory SQLite database, seeded with the registry, and the handlers that
 * read it a page at a time. Edits reach the table through the journal
 * (`journal.ts`), which calls `apply` for each committed change.
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Option } from 'effect'
import { bind, databaseLayer, query, sortTerms, source } from 'foldkit-remote-drizzle'
import { RemoteServer } from 'foldkit-remote-server'
import { type ProductChange, Registry } from './domain.js'
import { ProductsQuery } from './operations.js'

const products = sqliteTable('products', {
  id: text('id').primaryKey(),
  upc: text('upc').notNull(),
  description: text('description').notNull(),
  line: text('line').notNull(),
  status: text('status').notNull(),
  cents: integer('cents').notNull(),
})

export const Db = bind(Registry, { Product: { table: products } })

const lines = ['Hardware', 'Garden', 'Plumbing', 'Electrical', 'Paint', 'Tools'] as const
const nouns = ['Anchor', 'Bolt', 'Cable', 'Dowel', 'Elbow', 'Fuse', 'Gasket', 'Hinge'] as const
const sizes = ['small', 'medium', 'large', 'heavy-duty'] as const
const statuses = ['Active', 'Active', 'Active', 'Discontinued', 'Pending'] as const

/** A UPC-A: eleven digits and the check digit that makes them valid. */
const upcOf = (index: number): string => {
  const digits = String(10_000_000_000 + index * 7919).slice(-11)
  const sum = [...digits].reduce(
    (total, digit, position) => total + Number(digit) * (position % 2 === 0 ? 3 : 1),
    0,
  )
  return `${digits}${(10 - (sum % 10)) % 10}`
}

/** Padded, so the id order the server falls back to is the registry's order. */
export const productId = (index: number): string => `p${String(index).padStart(6, '0')}`

/** The product the seed writes at `index`, the same every time so a test can name one. */
export const seedOf = (index: number) => ({
  id: productId(index),
  upc: upcOf(index),
  description: `${nouns[index % nouns.length]!}, ${sizes[index % sizes.length]!} #${index}`,
  line: lines[index % lines.length]!,
  status: statuses[index % statuses.length]!,
  cents: ((index * 37) % 10_000) + 99,
})

/**
 * An in-memory database seeded with `count` products, the server over it, and
 * the layer its sources read it through.
 */
export const openServer = ({ count = 100_000 }: { readonly count?: number } = {}) => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`create table products (
    id text primary key, upc text not null, description text not null,
    line text not null, status text not null, cents integer not null
  )`)
  const insert = sqlite.prepare('insert into products values (?, ?, ?, ?, ?, ?)')
  sqlite.exec('begin')
  for (let index = 0; index < count; index += 1) {
    const { id, upc, description, line, status, cents } = seedOf(index)
    insert.run(id, upc, description, line, status, cents)
  }
  sqlite.exec('commit')
  const db = drizzle({ client: sqlite })

  // A committed edit, applied: the journal calls this once per change, in
  // the order it committed them. A field a change does not hold is left.
  const setDescription = sqlite.prepare('update products set description = ? where id = ?')
  const setCents = sqlite.prepare('update products set cents = ? where id = ?')
  const apply = (change: ProductChange) => {
    if (Option.isSome(change.description)) setDescription.run(change.description.value, change.id)
    if (Option.isSome(change.cents)) setCents.run(change.cents.value, change.id)
  }

  return {
    server: RemoteServer.make({
      entities: [source(Db.Product)],
      queries: [
        query(ProductsQuery, {
          entity: Db.Product,
          // A description is not unique, so the adapter breaks ties by id; no sort is id order.
          orderBy: ({ sort }) =>
            sortTerms(sort, { description: products.description, cents: products.cents }),
        }),
      ],
    }),
    layer: databaseLayer(db),
    apply,
    /** The row as the database holds it, to check a write against. */
    row: (id: string) => sqlite.prepare('select * from products where id = ?').get(id),
    close: () => sqlite.close(),
  }
}
