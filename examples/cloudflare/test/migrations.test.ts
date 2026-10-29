// @vitest-environment node
/**
 * The migrations say what the code says: a change to a table or a library
 * that moves what it expects fails here, not in a deployed database.
 */
import { readFileSync } from 'node:fs'
import { is } from 'drizzle-orm'
import {
  getTableConfig,
  type IndexColumn,
  SQLiteColumn,
  type SQLiteTable,
} from 'drizzle-orm/sqlite-core'
import { rowChangeLog } from 'foldkit-remote-drizzle'
import { expect, it } from 'vitest'
import { accounts, storage } from '../src/auth.js'
import { Db, ledger } from '../src/schema.js'

/** A migration's statements, one per line, without its comments and drops. */
const statementsOf = (file: string) =>
  readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line !== '' && !line.startsWith('--') && !line.startsWith('DROP '))

it('keeps the row log as rowChangeLog writes it', () => {
  expect(statementsOf('0004_row_change_log.sql')).toEqual(rowChangeLog(Db.Todo))
})

const quoted = (name: string) => `"${name}"`

/** An index's column; Yielded indexes no expression. */
const indexed = (column: IndexColumn) => {
  if (!is(column, SQLiteColumn)) throw new Error('An index on an expression')
  return quoted(column.name)
}

/** The SQLite a Drizzle table declares: its columns, then its indexes. */
const createTable = (table: SQLiteTable): ReadonlyArray<string> => {
  const { name, columns, indexes, primaryKeys } = getTableConfig(table)
  const column = (c: (typeof columns)[number]) =>
    `${quoted(c.name)} ${c.getSQLType()}${c.primary ? ' primary key' : ''}${c.notNull ? ' not null' : ''}`
  const keys = primaryKeys.map(
    key => `primary key (${key.columns.map(c => quoted(c.name)).join(', ')})`,
  )
  return [
    `create table if not exists ${quoted(name)} (${[...columns.map(column), ...keys].join(', ')});`,
    ...indexes.map(
      ({ config }) =>
        `create ${config.unique ? 'unique ' : ''}index if not exists ${quoted(config.name)} on ${quoted(name)} (${config.columns.map(indexed).join(', ')});`,
    ),
  ]
}

it("creates the accounts and Yielded's tables as the auth storage declares them", () => {
  // Yielded checks the columns and unique keys it reads when it first runs;
  // this holds the rest of each table to its declaration too: types,
  // `not null`, and the indexes its lookups use.
  expect(statementsOf('0005_auth.sql')).toEqual(
    [accounts, ...Object.values(storage.schema)].flatMap(createTable),
  )
})

it("creates the todos writer's ledger, keyed by asker, operation and row, indexed by time", () => {
  expect(statementsOf('0006_write_ledger.sql')).toEqual(createTable(ledger))
})
