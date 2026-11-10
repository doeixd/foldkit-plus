/**
 * The SQLite a Drizzle table declares, as the migrations hold it: its
 * columns, primary and foreign keys, the CHECKs given, then its indexes. Read by
 * `migrations.test.ts`, which holds each migration to the code.
 */
import { is, SQL, StringChunk } from 'drizzle-orm'
import {
  getTableConfig,
  type IndexColumn,
  SQLiteColumn,
  type SQLiteTable,
} from 'drizzle-orm/sqlite-core'

const quoted = (name: string) => `"${name}"`

/** An index's column, or `desc(column)`; nothing here indexes another expression. */
const indexed = (column: IndexColumn) => {
  if (is(column, SQLiteColumn)) return quoted(column.name)
  if (is(column, SQL)) {
    const [inner, after, ...rest] = column.queryChunks
    if (
      rest.length === 0 &&
      is(inner, SQLiteColumn) &&
      after instanceof StringChunk &&
      [after.value].flat().join('') === ' desc'
    )
      return `${quoted(inner.name)} desc`
  }
  throw new Error('An index on an expression')
}

export const createTable = (
  table: SQLiteTable,
  checks: ReadonlyArray<string> = [],
): ReadonlyArray<string> => {
  const { name, columns, indexes, foreignKeys, primaryKeys } = getTableConfig(table)
  const column = (c: (typeof columns)[number]) =>
    `${quoted(c.name)} ${c.getSQLType()}${c.primary ? ' primary key' : ''}${c.notNull ? ' not null' : ''}${c.hasDefault && c.default !== undefined ? ` default ${String(c.default)}` : ''}`
  const keys = primaryKeys.map(
    key => `primary key (${key.columns.map(c => quoted(c.name)).join(', ')})`,
  )
  const references = foreignKeys.map(key => {
    const { columns: from, foreignColumns: to, foreignTable } = key.reference()
    const target = getTableConfig(foreignTable).name
    return `foreign key (${from.map(c => quoted(c.name)).join(', ')}) references ${quoted(target)} (${to.map(c => quoted(c.name)).join(', ')})`
  })
  return [
    `create table if not exists ${quoted(name)} (${[...columns.map(column), ...keys, ...references, ...checks].join(', ')});`,
    ...indexes.map(
      ({ config }) =>
        `create ${config.unique ? 'unique ' : ''}index if not exists ${quoted(config.name)} on ${quoted(name)} (${config.columns.map(indexed).join(', ')});`,
    ),
  ]
}
