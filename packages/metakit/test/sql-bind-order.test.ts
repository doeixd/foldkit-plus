/**
 * A related aggregate whose value and filter both bind a parameter (#618):
 * SQLite's anonymous `?` takes them in the order the SQL text names them, and
 * the subquery writes SELECT's value ahead of WHERE's filter.
 */
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Bool, Eq, Num, Ord, Path } from 'metakit'
import * as Relation from 'metakit/relation'
import * as Sql from 'metakit/sql'

const Owner = Schema.Struct({ id: Schema.String })
const Line = Schema.Struct({
  id: Schema.String,
  owner: Schema.String,
  amount: Schema.Int,
  units: Schema.Int,
})
const Lines = Relation.make('Line.owner', Line)
const { row } = Path.forEnv({ row: Owner })

const db = new DatabaseSync(':memory:')
db.exec(`CREATE TABLE "owners" ("id" TEXT PRIMARY KEY)`)
db.exec(
  `CREATE TABLE "lines" ("id" TEXT PRIMARY KEY, "owner" TEXT, "amount" INTEGER, "units" INTEGER)`,
)
db.exec(`INSERT INTO "owners" VALUES ('o1'), ('o2')`)
// o1: one line passes the filter (10 + 5 = 15). o2: none passes.
db.exec(`INSERT INTO "lines" VALUES ('l1', 'o1', 10, 3), ('l2', 'o1', 1, 1), ('l3', 'o2', 10, 1)`)

const options = {
  dialect: 'sqlite' as const,
  table: 'owners',
  relations: { 'Line.owner': { table: 'lines', foreignKey: 'owner' } },
}

const total = Relation.sum(
  row,
  Lines,
  each => Num.add(each.amount, 5),
  each => Ord.gte(each.units, 2),
)
const predicate = Eq.is(total, 15)
const surrounded = Bool.and(Eq.is(row.id, 'o1'), predicate)

const found = (query: typeof predicate): ReadonlyArray<unknown> => {
  const where = Result.getOrThrow(Sql.toWhere(query, options))
  return db
    .prepare(`SELECT "id" FROM "owners" WHERE ${where.text} ORDER BY "id"`)
    .all(...(where.params as ReadonlyArray<SQLInputValue>))
    .map(one => one['id'])
}

describe('SQLite binds a related aggregate in SQL text order', () => {
  it('places the value parameter before the filter parameter', () => {
    expect(found(predicate)).toEqual(['o1'])
  })

  it('keeps that order beside a bound value outside the subquery', () => {
    expect(found(surrounded)).toEqual(['o1'])
  })
})
