/**
 * The server's interpretation of the domain: a `products` table in an
 * in-memory SQLite database, seeded with the registry, and the handlers that
 * read it a page at a time. Edits reach the table through the journal
 * (`journal.ts`), which calls `apply` for each committed change.
 */
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
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
  revision: integer('revision').notNull(),
})

export const Db = bind(Registry, { Product: { table: products } })

/** A value a statement binds. */
export type SqlValue = string | number | null

/**
 * The SQLite the server runs on: Node's own for `pnpm dev` and the tests
 * (`sqliteNode.ts`), sql.js in a browser (`sqliteBrowser.ts`). Only what the
 * server needs, and the Drizzle database over the same connection.
 */
export interface Sqlite {
  readonly exec: (statements: string) => void
  /** Runs one statement for each row of values, in one transaction. */
  readonly runAll: (statement: string, rows: ReadonlyArray<ReadonlyArray<SqlValue>>) => void
  readonly get: (query: string, values: ReadonlyArray<SqlValue>) => unknown
  /** The Drizzle database over it, for `databaseLayer`. */
  readonly drizzle: unknown
  readonly close: () => void
}

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

/** The table's column for each member an edit can change. */
const columnOf = {
  description: 'description',
  cents: 'cents',
  line: 'line',
  status: 'status',
} as const satisfies Record<ProductChange['member'], string>

/**
 * An in-memory database seeded with `count` products, the server over it, and
 * the layer its sources read it through.
 */
export const openServer = (
  sqlite: Sqlite,
  { count = 100_000 }: { readonly count?: number } = {},
) => {
  sqlite.exec(`create table products (
    id text primary key, upc text not null, description text not null,
    line text not null, status text not null, cents integer not null,
    revision integer not null
  )`)
  sqlite.runAll(
    'insert into products values (?, ?, ?, ?, ?, ?, 0)',
    Array.from({ length: count }, (_, index) => {
      const { id, upc, description, line, status, cents } = seedOf(index)
      return [id, upc, description, line, status, cents]
    }),
  )

  // A committed edit, applied, with the sequence it committed at: the journal
  // calls this once per change, in the order it committed them. Only the
  // journal writes the table. The write and the revision are one statement,
  // and it never moves a row back, so recovery may run it again (the effect
  // ledger and this table are separate databases): an older edit run after a
  // newer one changes nothing. `<=`, not `<`, so a second change to the same
  // product in one operation is applied too. A change is one cell; the
  // column it writes comes from this fixed list, never from the change's text.
  const apply = (change: ProductChange, at: number) =>
    sqlite.runAll(
      `update products set ${columnOf[change.member]} = ?, revision = ? where id = ? and revision <= ?`,
      [[change.value, at, change.id, at]],
    )

  return {
    server: RemoteServer.make({
      entities: [source(Db.Product)],
      queries: [
        query(ProductsQuery, {
          entity: Db.Product,
          // Only a UPC is unique, so the adapter breaks ties by id; no sort is id order.
          orderBy: ({ sort }) =>
            sortTerms(sort, {
              upc: products.upc,
              description: products.description,
              line: products.line,
              status: products.status,
              cents: products.cents,
            }),
        }),
      ],
    }),
    layer: databaseLayer(sqlite.drizzle),
    apply,
    /** The row as the database holds it, to check a write against. */
    row: (id: string) => sqlite.get('select * from products where id = ?', [id]),
    close: () => sqlite.close(),
  }
}
