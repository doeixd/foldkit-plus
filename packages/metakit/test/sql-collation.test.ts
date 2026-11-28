/**
 * A SQLite column may declare a collation (`NOCASE` here) that matches text an
 * expression promises to compare exactly or by code point (#621). The lowering
 * pins its side to `BINARY`, so the rows agree with `Expr.eval`.
 */
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Eq, Expr, Path, Str } from 'metakit'
import * as Sql from 'metakit/sql'

const Row = Schema.Struct({
  id: Schema.String,
  v: Schema.String,
  d: Schema.String,
  p: Schema.String,
})
type Row = typeof Row.Type
const { row } = Path.forEnv({ row: Row })
type Env = { readonly row: Row }

const predicates: Readonly<Record<string, Expr.Expr<Env, boolean | null>>> = {
  'str.lt a collated column before a literal': Str.lt(row.v, 'a'),
  'str.lt a literal before a collated column': Str.lt('a', row.v),
  'str.gt a collated column after a literal': Str.gt(row.v, 'a'),
  'eq.is a collated column against a literal': Eq.is(row.v, 'z'),
  'eq.is a literal against a collated column': Eq.is('z', row.v),
  'eq.oneOf a collated column': Eq.oneOf(row.v, ['z']),
  'a match on a collated column': Eq.is(Expr.matchOrElse(row.v, { z: 1 }, 0), 1),
  'str.lt a BINARY column': Str.lt(row.d, 'a'),
  'eq.is a BINARY column': Eq.is(row.d, 'z'),
  'str.startsWith a collated prefix': Str.startsWith(row.v, row.p),
}

const rows: ReadonlyArray<Row> = [
  { id: 'upper', v: 'Z', d: 'Z', p: 'z' },
  { id: 'lower', v: 'z', d: 'z', p: 'z' },
  { id: 'mixed', v: 'Z', d: 'z', p: 'z' },
  { id: 'capA', v: 'A', d: 'A', p: 'a' },
  { id: 'lowA', v: 'a', d: 'a', p: 'a' },
  { id: 'mid', v: 'm', d: 'm', p: 'm' },
]

const db = new DatabaseSync(':memory:')
db.exec(
  `CREATE TABLE "rows" ("id" TEXT PRIMARY KEY, "v" TEXT COLLATE NOCASE, "d" TEXT, "p" TEXT COLLATE NOCASE)`,
)
for (const one of rows) {
  db.prepare(`INSERT INTO "rows" VALUES (?, ?, ?, ?)`).run(one.id, one.v, one.d, one.p)
}

const held = (predicate: Expr.Expr<Env, boolean | null>): ReadonlyArray<string> =>
  rows
    .filter(one => Expr.eval(predicate, { row: one }) === true)
    .map(one => one.id)
    .sort()

const found = (predicate: Expr.Expr<Env, boolean | null>): ReadonlyArray<unknown> => {
  const where = Result.getOrThrow(Sql.toWhere(predicate, { dialect: 'sqlite' }))
  return db
    .prepare(`SELECT "id" FROM "rows" WHERE ${where.text} ORDER BY "id"`)
    .all(...(where.params as ReadonlyArray<SQLInputValue>))
    .map(one => one['id'])
}

describe('SQLite compares text exactly, whatever the column collation declares', () => {
  for (const [name, predicate] of Object.entries(predicates)) {
    it(name, () => {
      expect(found(predicate)).toEqual(held(predicate))
    })
  }

  it('a NOCASE fixture distinguishes case where the expression does', () => {
    expect(held(predicates['eq.is a collated column against a literal']!)).toEqual(['lower'])
    expect(held(predicates['str.lt a collated column before a literal']!)).toEqual([
      'capA',
      'mixed',
      'upper',
    ])
  })
})
