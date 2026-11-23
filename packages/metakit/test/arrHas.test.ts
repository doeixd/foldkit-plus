import { DatabaseSync } from 'node:sqlite'
import { PGlite } from '@electric-sql/pglite'
import { Effect, Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import * as Abstract from '../src/abstract/check.js'
import { Arr, Expr, Ord, Path, Verdict } from '../src/index.js'
import * as Prove from '../src/prove.js'
import * as Sql from '../src/sql.js'

const Row = Schema.Struct({
  tags: Schema.NullOr(Schema.Array(Schema.NullOr(Schema.String))),
  needle: Schema.NullOr(Schema.String),
  nums: Schema.NullOr(Schema.Array(Schema.NullOr(Schema.Int))),
  numNeedle: Schema.NullOr(Schema.Int),
})
const $ = Path.forSchema(Schema.Struct({ row: Row }))

const evalSqlTerm = (
  dialect: 'sqlite' | 'postgres',
  expr: Expr.Expr<{ readonly row: Schema.Schema.Type<typeof Row> }, boolean | null>,
): { readonly sql: string; readonly params: ReadonlyArray<unknown> } => {
  const lowered = Sql.lowerNode(expr.node, { dialect, rowPrefix: ['row'] })
  if (Result.isFailure(lowered)) throw new Error(lowered.failure.reason)
  const params: Array<unknown> = []
  const text = lowered.success
    .map(piece =>
      Sql.SqlPiece.$match(piece, {
        Text: ({ text: t }) => t,
        Value: ({ value }) => {
          params.push(value)
          return dialect === 'postgres' ? `$${params.length}` : '?'
        },
        Column: ({ segments }) => `"${segments.join('_')}"`,
        Foreign: () => {
          throw new Error('unexpected foreign')
        },
        Each: () => {
          throw new Error('unexpected each')
        },
        Rows: () => {
          throw new Error('unexpected rows')
        },
      }),
    )
    .join('')
  return { sql: `SELECT ${text} AS ans FROM t`, params }
}

describe('Arr.has (Bout 1.4)', () => {
  it('evaluates scalar membership in memory with strict nulls, -0 normalization, and NUL/non-finite refusal', () => {
    const Env = Schema.Struct({
      roles: Schema.NullOr(Schema.Array(Schema.String)),
      nums: Schema.Array(Schema.Number),
    })
    const e = Path.forSchema(Env)
    expect(Expr.eval(Arr.has(e.roles, 'admin'), { roles: ['viewer', 'admin'], nums: [] })).toBe(
      true,
    )
    expect(Expr.eval(Arr.has(e.roles, 'owner'), { roles: ['viewer', 'admin'], nums: [] })).toBe(
      false,
    )
    expect(Expr.eval(Arr.has(e.roles, 'admin'), { roles: [], nums: [] })).toBe(false)
    expect(Expr.eval(Arr.has(e.roles, 'admin'), { roles: null, nums: [] })).toBe(null)
    expect(Expr.eval(Arr.has(e.roles, null), { roles: [], nums: [] })).toBe(null)
    expect(Expr.eval(Arr.has(e.nums, -0), { roles: [], nums: [0, 1] })).toBe(true)
    expect(
      Result.isFailure(Expr.evalResult(Arr.has(e.roles, 'bad\u0000'), { roles: ['a'], nums: [] })),
    ).toBe(true)
    expect(
      Result.isFailure(Expr.evalResult(Arr.has(e.nums, Number.NaN), { roles: [], nums: [1] })),
    ).toBe(true)
  })

  it('proves arr.has implies arr.count >= 1 in Abstract and Z3', async () => {
    const Roles = Schema.Struct({ roles: Schema.Array(Schema.String) }).pipe(
      Expr.refine($ => Arr.has($.roles, 'admin')),
    )
    const r = Path.forSchema(Roles)
    const nonEmpty = Ord.gte(Arr.count(r.roles), 1)
    expect(Verdict.isTrue(Abstract.checkInvariant(Roles, nonEmpty))).toBe(true)
    const z3Res = await Effect.runPromise(Prove.invariant(Roles, nonEmpty))
    expect(Verdict.isTrue(z3Res)).toBe(true)
  })

  it('matches memory 100% on real SQLite and PGlite across present, absent, empty, and null cases', async () => {
    const cases: ReadonlyArray<Schema.Schema.Type<typeof Row>> = [
      { tags: ['viewer', 'admin'], needle: 'admin', nums: [1, 2, 3], numNeedle: 2 },
      { tags: ['viewer', 'editor'], needle: 'admin', nums: [1, 2, 3], numNeedle: 9 },
      { tags: ['a', null], needle: 'missing', nums: [1, null], numNeedle: 3 },
      { tags: ['a', null], needle: 'a', nums: [1, null], numNeedle: 1 },
      { tags: [], needle: 'admin', nums: [], numNeedle: 1 },
      { tags: [], needle: null, nums: [], numNeedle: null },
      { tags: ['a', 'b'], needle: null, nums: [1], numNeedle: null },
      { tags: null, needle: 'admin', nums: null, numNeedle: 1 },
      { tags: null, needle: null, nums: null, numNeedle: null },
    ]

    const exprs = [
      { name: 'textHas', expr: Arr.has($.row.tags, $.row.needle) },
      { name: 'numHas', expr: Arr.has($.row.nums, $.row.numNeedle) },
    ] as const

    const sqlite = new DatabaseSync(':memory:')
    sqlite.exec('CREATE TABLE t (tags TEXT, needle TEXT, nums TEXT, numNeedle INTEGER)')
    const pg = new PGlite()
    await pg.exec('CREATE TABLE t (tags TEXT[], needle TEXT, nums INTEGER[], "numNeedle" INTEGER)')

    try {
      for (const row of cases) {
        sqlite.exec('DELETE FROM t')
        sqlite
          .prepare('INSERT INTO t VALUES (?, ?, ?, ?)')
          .run(
            row.tags === null ? null : JSON.stringify(row.tags),
            row.needle,
            row.nums === null ? null : JSON.stringify(row.nums),
            row.numNeedle,
          )
        await pg.exec('DELETE FROM t')
        await pg.query('INSERT INTO t VALUES ($1, $2, $3, $4)', [
          row.tags,
          row.needle,
          row.nums,
          row.numNeedle,
        ])

        for (const { name, expr } of exprs) {
          const expected = Expr.eval(expr, { row })

          const sq = evalSqlTerm('sqlite', expr)
          const sqRaw = (
            sqlite.prepare(sq.sql).get(...(sq.params as Array<number | string | null>)) as {
              ans: number | null
            }
          ).ans
          const sqVal = sqRaw !== null ? sqRaw !== 0 : null

          const pq = evalSqlTerm('postgres', expr)
          const pgRes = await pg.query<{ ans: boolean | null }>(pq.sql, [...pq.params])
          const pgVal = pgRes.rows[0]!.ans

          expect(sqVal, `sqlite ${name} on ${JSON.stringify(row)}`).toBe(expected)
          expect(pgVal, `postgres ${name} on ${JSON.stringify(row)}`).toBe(expected)
        }
      }

      // C3: SQLite boolean-vs-integer distinction in json_each (true != 1, false != 0).
      sqlite.exec('CREATE TABLE b (flags TEXT)')
      sqlite.prepare('INSERT INTO b VALUES (?)').run(JSON.stringify([true]))
      const BoolRow = Schema.Struct({
        row: Schema.Struct({ flags: Schema.Array(Schema.Union([Schema.Boolean, Schema.Int])) }),
      })
      const $b = Path.forSchema(BoolRow)
      const checkBool = (needle: boolean | number, expected: boolean) => {
        const expr = Arr.has($b.row.flags, needle)
        const lowered = Sql.lowerNode(expr.node, { dialect: 'sqlite', rowPrefix: ['row'] })
        expect(Result.isSuccess(lowered)).toBe(true)
        if (Result.isSuccess(lowered)) {
          const params: Array<number | string | null> = []
          const text = lowered.success
            .map(piece =>
              Sql.SqlPiece.$match(piece, {
                Text: ({ text: t }) => t,
                Value: ({ value }) => {
                  params.push(typeof value === 'boolean' ? (value ? 1 : 0) : (value as number))
                  return '?'
                },
                Column: ({ segments }) => `"${segments.join('_')}"`,
                Foreign: () => '',
                Each: () => '',
                Rows: () => '',
              }),
            )
            .join('')
          const raw = (
            sqlite.prepare(`SELECT ${text} AS ans FROM b`).get(...params) as { ans: number }
          ).ans
          expect(raw !== 0, `sqlite [true] has ${String(needle)}`).toBe(expected)
        }
      }
      checkBool(true, true)
      checkBool(false, false)
      checkBool(1, false)
    } finally {
      sqlite.close()
      await pg.close()
    }
  })
})
