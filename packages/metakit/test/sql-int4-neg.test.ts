/**
 * Postgres evaluates `-` over an `int4` column in int4 arithmetic before any
 * later cast, so negating the smallest int4 raises unless the operand is
 * widened first (#622).
 */
import { PGlite } from '@electric-sql/pglite'
import { Result, Schema } from 'effect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Expr, Num, Ord, Path } from '@doeixd/metakit'
import * as Sql from '@doeixd/metakit/sql'

const Row = Schema.Struct({ id: Schema.String, n: Schema.NullOr(Schema.Int) })
const { row } = Path.forEnv({ row: Row })
const predicate = Ord.gt(Num.neg(row.n), 0)

const rows = [
  { id: 'min', n: -2147483648 },
  { id: 'minus', n: -1 },
  { id: 'zero', n: 0 },
  { id: 'max', n: 2147483647 },
  { id: 'null', n: null },
]
const held = rows.filter(row => Expr.eval(predicate, { row }) === true).map(row => row.id)

let pg: PGlite
beforeAll(async () => {
  pg = await PGlite.create()
  await pg.exec(`CREATE TABLE "rows" ("id" TEXT PRIMARY KEY, "n" INTEGER)`)
  for (const row of rows) {
    await pg.query(`INSERT INTO "rows" VALUES ($1, $2)`, [row.id, row.n])
  }
}, 60_000)
afterAll(() => pg.close())

describe('Postgres widens an integer before negating it', () => {
  it('selects the rows evaluation selects, the smallest int4 included', async () => {
    const where = Result.getOrThrow(Sql.toWhere(predicate))
    const found = await pg.query<{ id: string }>(
      `SELECT "id" FROM "rows" WHERE ${where.text} ORDER BY "id"`,
      [...where.params],
    )
    expect(held).toEqual(['min', 'minus'])
    expect(found.rows.map(row => row.id)).toEqual(held)
  })
})
