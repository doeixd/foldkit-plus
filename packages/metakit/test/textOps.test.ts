import { DatabaseSync } from 'node:sqlite'
import { PGlite } from '@electric-sql/pglite'
import { Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import * as Conformance from '../src/conformance.js'
import { Expr, Path, Str } from '../src/index.js'
import * as Sql from '../src/sql.js'
import {
  BankAccount,
  bankAccountIsChecking,
  Order,
  orderCurrencyUpper,
  orderDisplayRef,
} from './fixtures/domains601.js'

const Row = Schema.Struct({
  a: Schema.NullOr(Schema.String),
  b: Schema.NullOr(Schema.String),
})
const $ = Path.forSchema(Schema.Struct({ row: Row }))

const evalSqlTerm = (
  dialect: 'sqlite' | 'postgres',
  expr: Expr.Expr<{ readonly row: Schema.Schema.Type<typeof Row> }, string | boolean | null>,
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

describe('Text operations: concat, endsWith, upperAscii (Bout 1.3)', () => {
  it('evaluates concat, endsWith, upperAscii in memory including Unicode, ASCII-only case, and NUL refusal', () => {
    expect(Expr.eval(Str.upperAscii('éßaZ0'), {})).toBe('éßAZ0')
    expect(Expr.eval(Str.concat('ORD-', '123'), {})).toBe('ORD-123')
    expect(Expr.eval(Str.endsWith('ACC-100-CHK', '-CHK'), {})).toBe(true)
    expect(Expr.eval(Str.endsWith('hello🚀', '🚀'), {})).toBe(true)
    expect(Expr.eval(Str.endsWith('hello', ''), {})).toBe(true)
    expect(Expr.eval(Str.endsWith(null, ''), {})).toBe(null)
    expect(Expr.eval(Str.endsWith('hello', null), {})).toBe(null)
    expect(Result.isFailure(Expr.evalResult(Str.concat('a\u0000b', 'c'), {}))).toBe(true)
    expect(Result.isFailure(Expr.evalResult(Str.upperAscii('a\u0000b'), {}))).toBe(true)
    expect(Result.isFailure(Expr.evalResult(Str.endsWith('a\u0000b', 'b'), {}))).toBe(true)

    // #601 §2 consumers
    const orderRow: Schema.Schema.Type<typeof Order> = {
      totalCents: 1000,
      lines: 2,
      rawDiscount: 100,
      maxDiscount: 200,
      unitDollars: 10,
      code: 'A42',
      currency: 'usd',
    }
    expect(Expr.eval(orderDisplayRef, orderRow)).toBe('ORD-A42')
    expect(Expr.eval(orderCurrencyUpper, orderRow)).toBe('USD')

    const bankRow: Schema.Schema.Type<typeof BankAccount> = {
      balance: 500,
      correction: -10,
      rawFee: 100,
      lastFeeOn: 20_000,
      accountCode: '42-CHK',
    }
    expect(Expr.eval(bankAccountIsChecking, bankRow)).toBe(true)
  })

  it('satisfies partial evaluation laws and core property checks', () => {
    const reports = Conformance.checkAllProperties()
    for (const id of ['str.concat', 'str.endsWith', 'str.upperAscii'] as const) {
      const rep = reports.find(r => r.op === id)
      expect(rep?.ok, `${id}: ${JSON.stringify(rep?.failures)}`).toBe(true)
    }

    const $o = Path.forSchema(Order)
    expect(Expr.residualize(Str.upperAscii(Str.upperAscii($o.currency)), {}).node).toEqual(
      Str.upperAscii($o.currency).node,
    )
    expect(Expr.residualize(Str.concat(Str.upperAscii($o.currency), ''), {}).node).toEqual(
      Str.upperAscii($o.currency).node,
    )
    expect(Expr.residualize(Str.concat('', Str.upperAscii($o.currency)), {}).node).toEqual(
      Str.upperAscii($o.currency).node,
    )
  })

  it('matches memory 100% on real SQLite and PGlite across ASCII, Unicode, emoji, empty suffix, and nulls', async () => {
    const cases: ReadonlyArray<Schema.Schema.Type<typeof Row>> = [
      { a: 'éßa', b: 'a' },
      { a: 'éßa', b: 'ßa' },
      { a: 'hello🚀', b: '🚀' },
      { a: 'hello🚀', b: '' },
      { a: '', b: '' },
      { a: '', b: 'x' },
      { a: 'İıΣσς', b: 'ς' },
      { a: 'ACC-100-CHK', b: '-CHK' },
      { a: 'ACC-100-SAV', b: '-CHK' },
      { a: null, b: '' },
      { a: 'abc', b: null },
      { a: null, b: null },
    ]

    const exprs: ReadonlyArray<{
      readonly name: string
      readonly expr: Expr.Expr<
        { readonly row: Schema.Schema.Type<typeof Row> },
        string | boolean | null
      >
    }> = [
      { name: 'concat', expr: Str.concat($.row.a, $.row.b) },
      { name: 'endsWith', expr: Str.endsWith($.row.a, $.row.b) },
      { name: 'upperAscii', expr: Str.upperAscii($.row.a) },
    ]

    const sqlite = new DatabaseSync(':memory:')
    sqlite.exec('CREATE TABLE t (a TEXT, b TEXT)')
    const pg = new PGlite()
    await pg.exec('CREATE TABLE t (a TEXT, b TEXT)')

    try {
      for (const row of cases) {
        sqlite.exec('DELETE FROM t')
        sqlite.prepare('INSERT INTO t VALUES (?, ?)').run(row.a, row.b)
        await pg.exec('DELETE FROM t')
        await pg.query('INSERT INTO t VALUES ($1, $2)', [row.a, row.b])

        for (const { name, expr } of exprs) {
          const expected = Expr.eval(expr, { row })

          const sq = evalSqlTerm('sqlite', expr)
          const sqRaw = (
            sqlite.prepare(sq.sql).get(...(sq.params as Array<string | null>)) as {
              ans: string | number | null
            }
          ).ans
          const sqVal = name === 'endsWith' && sqRaw !== null ? sqRaw !== 0 : sqRaw

          const pq = evalSqlTerm('postgres', expr)
          const pgRes = await pg.query<{ ans: string | boolean | null }>(pq.sql, [...pq.params])
          const pgVal = pgRes.rows[0]!.ans

          expect(sqVal, `sqlite ${name} on ${JSON.stringify(row)}`).toBe(expected)
          expect(pgVal, `postgres ${name} on ${JSON.stringify(row)}`).toBe(expected)
        }
      }
    } finally {
      sqlite.close()
      await pg.close()
    }
  })
})
