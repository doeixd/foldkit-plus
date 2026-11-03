/**
 * Postgres support for `foldkit-remote-drizzle`.
 *
 * The main entry imports nothing from `drizzle-orm/pg-core`, so a SQLite
 * application never bundles it. A Postgres application registers the
 * operations the main entry needs once, before binding a table:
 *
 * ```ts
 * import { postgres } from 'foldkit-remote-drizzle/pg'
 * postgres()
 * ```
 */
import { check, getTableConfig, PgDialect, type PgTable } from 'drizzle-orm/pg-core'
import { registerPostgres } from './dialect.js'

export const postgres = (): void => {
  registerPostgres({
    tableConfig: table => getTableConfig(table as PgTable),
    dialect: () => new PgDialect(),
    check: (name, condition) => check(name, condition),
  })
}
