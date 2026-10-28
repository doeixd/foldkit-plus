/**
 * The SQLite a Drizzle table declares, as the migrations hold it: its
 * columns and foreign keys, the CHECKs given, then its indexes. Read by
 * `migrations.test.ts`, which holds each migration to the code.
 */
import { is } from 'drizzle-orm'
import {
  getTableConfig,
  type IndexColumn,
  SQLiteColumn,
  type SQLiteTable,
} from 'drizzle-orm/sqlite-core'

const quoted = (name: string) => `"${name}"`

/** An index's column; nothing here indexes an expression. */
const indexed = (column: IndexColumn) => {
  if (!is(column, SQLiteColumn)) throw new Error('An index on an expression')
  return quoted(column.name)
}

export const createTable = (
  table: SQLiteTable,
  checks: ReadonlyArray<string> = [],
): ReadonlyArray<string> => {
  const { name, columns, indexes, foreignKeys } = getTableConfig(table)
  const column = (c: (typeof columns)[number]) =>
    `${quoted(c.name)} ${c.getSQLType()}${c.primary ? ' primary key' : ''}${c.notNull ? ' not null' : ''}${c.hasDefault && c.default !== undefined ? ` default ${String(c.default)}` : ''}`
  const references = foreignKeys.map(key => {
    const { columns: from, foreignColumns: to, foreignTable } = key.reference()
    const target = getTableConfig(foreignTable).name
    return `foreign key (${from.map(c => quoted(c.name)).join(', ')}) references ${quoted(target)} (${to.map(c => quoted(c.name)).join(', ')})`
  })
  return [
    `create table if not exists ${quoted(name)} (${[...columns.map(column), ...references, ...checks].join(', ')});`,
    ...indexes.map(
      ({ config }) =>
        `create ${config.unique ? 'unique ' : ''}index if not exists ${quoted(config.name)} on ${quoted(name)} (${config.columns.map(indexed).join(', ')});`,
    ),
  ]
}
