/**
 * Which Drizzle dialect a table or column belongs to, and the Postgres
 * operations the package cannot express without `drizzle-orm/pg-core`.
 *
 * The main entry reads a value's dialect from its Drizzle entity kinds, so a
 * SQLite application never imports `drizzle-orm/pg-core`. The few Postgres
 * operations it needs are registered by `foldkit-remote-drizzle/pg`, which a
 * Postgres application imports once.
 */
import { entityKindsOf, type AnyColumn, type SQL, type Table } from 'drizzle-orm'
import type { CheckBuilder as PgCheckBuilder } from 'drizzle-orm/pg-core'

const hasKind = (value: unknown, kind: string): boolean => entityKindsOf(value)?.has(kind) === true

export const isPostgresTable = (value: unknown): boolean => hasKind(value, 'PgTable')
export const isSqliteTable = (value: unknown): boolean => hasKind(value, 'SQLiteTable')
export const isPostgresColumn = (value: unknown): boolean => hasKind(value, 'PgColumn')

/** A table's foreign key, as `onDeleteOf` reads it, in either dialect. */
interface ForeignKeyShape {
  readonly reference: () => { readonly columns: ReadonlyArray<AnyColumn> }
  readonly onDelete?: string | undefined
}

/** What the package reads of a table's own config, in either dialect. */
interface TableConfigShape {
  readonly foreignKeys: ReadonlyArray<ForeignKeyShape>
  readonly checks: ReadonlyArray<{ readonly name: string; readonly value: SQL }>
  readonly schema?: string | undefined
}

/** A dialect that renders SQL to a query, as `PgDialect` does. */
interface DialectShape {
  sqlToQuery(sql: SQL): { readonly sql: string; readonly params: ReadonlyArray<unknown> }
}

interface PostgresOperations {
  readonly tableConfig: (table: Table) => TableConfigShape
  readonly dialect: () => DialectShape
  readonly check: (name: string, condition: SQL) => PgCheckBuilder
}

let operations: PostgresOperations | undefined

export const registerPostgres = (given: PostgresOperations): void => {
  operations = given
}

export const postgresOperations = (): PostgresOperations => {
  if (operations === undefined) {
    throw new Error(
      '[foldkit-remote-drizzle] a Postgres table was used, but its support was not registered; import { postgres } from "foldkit-remote-drizzle/pg" and call it once, before binding it',
    )
  }
  return operations
}
