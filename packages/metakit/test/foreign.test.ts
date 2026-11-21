/**
 * An operation an application defines is carried by id and version with no
 * evaluator; each reader takes its implementations from its caller, and
 * refuses or answers Unknown for a call it holds none for.
 */
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { sql as drizzleSql, type SQL } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { Effect, Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Abstract, Eq, Expr, Node, Ord, Path, Verdict } from 'metakit'
import { call } from 'metakit/build'
import * as Drizzle from 'metakit/drizzle'
import * as Prove from 'metakit/prove'
import * as Sql from 'metakit/sql'

const Row = Schema.Struct({ id: Schema.String, n: Schema.NullOr(Schema.Int), s: Schema.String })
type Row = typeof Row.Type
type Env = { readonly row: Row }
const { row } = Path.forEnv({ row: Row })

const double = Node.foreign({ id: 'app.double', version: 1, returns: 'number', nulls: 'strict' })
const shout = Node.foreign({ id: 'app.shout', version: 2, returns: 'text', nulls: 'own' })
const doubled = call<Env, number | null>(double, [row.n])
const isBig = Ord.gt(doubled, 10)

const memory: Expr.ForeignImplementations = {
  'app.double': { version: 1, run: ([n]) => (n as number) * 2 },
  'app.shout': { version: 2, run: ([s]) => (s === null ? 'NONE' : `${String(s)}!`) },
}

const env = (n: number | null): Env => ({ row: { id: 'a', n, s: 'hi' } })
const reason = (result: Result.Result<unknown, Node.Refusal>) =>
  Result.match(result, { onSuccess: () => 'answered', onFailure: refusal => refusal.reason })

describe('a foreign operation', () => {
  it('is refused where its id is a core prefix, or its version is not a positive integer', () => {
    expect(() =>
      Node.foreign({ id: 'num.double', version: 1, returns: 'number', nulls: 'strict' }),
    ).toThrow(/core prefix "num\."/)
    expect(() =>
      Node.foreign({ id: 'app.x', version: 0, returns: 'number', nulls: 'strict' }),
    ).toThrow(/positive integer/)
  })

  it('is one term with its version, and another version is another', () => {
    const later = Node.foreign({ id: 'app.double', version: 2, returns: 'number', nulls: 'strict' })
    expect(Node.key(doubled.node)).not.toBe(Node.key(call(later, [row.n]).node))
    expect(Expr.show(isBig)).toBe('(app.double(row.n) > 10)')
  })
})

describe('evaluation', () => {
  it('runs the implementation it is given, under the operation null rule', () => {
    expect(Expr.evaluate(doubled, env(4), { foreign: memory })).toBe(8)
    expect(Expr.evaluate(doubled, env(null), { foreign: memory })).toBe(null)
    const shouted = call<Env, string>(shout, [Expr.lit(null)])
    expect(Expr.evaluate(shouted, env(1), { foreign: memory })).toBe('NONE')
  })

  it('refuses a call with no implementation, or one of another version, naming it', () => {
    const missing = Expr.evalResult(doubled, env(4))
    expect(reason(missing)).toBe('unsupported')
    expect(Result.isFailure(missing) && missing.failure.message).toContain('app.double@1')
    const stale = { 'app.double': { version: 2, run: () => 0 } }
    expect(reason(Expr.evalResult(doubled, env(4), { foreign: stale }))).toBe('unsupported')
    expect(Expr.holds(isBig, env(9))).toBe(false)
  })

  it('refuses an answer not of the declared kind, not finite, or holding a NUL', () => {
    const wrong = (run: () => unknown) => ({ 'app.double': { version: 1, run } })
    expect(reason(Expr.evalResult(doubled, env(1), { foreign: wrong(() => 'x') }))).toBe(
      'ill-typed',
    )
    expect(reason(Expr.evalResult(doubled, env(1), { foreign: wrong(() => NaN) }))).toBe(
      'non-finite',
    )
    const nul = { 'app.shout': { version: 2, run: () => 'a\u0000' } }
    expect(reason(Expr.evalResult(call<Env, string>(shout, ['x']), env(1), { foreign: nul }))).toBe(
      'unportable',
    )
  })
})

describe('partial evaluation and judge', () => {
  it('fold a call over known arguments where an implementation is given', () => {
    expect(Expr.residualize(doubled, { row: { n: 3 } }, { foreign: memory }).node).toEqual(
      Node.Lit({ value: 6 }),
    )
    expect(Expr.judge(isBig, { row: { n: 9 } }, { foreign: memory })._tag).toBe('True')
  })

  it('keep the call, and answer Unknown naming it, where none is', () => {
    expect(Expr.residualize(doubled, { row: { n: 3 } }).node._tag).toBe('Call')
    const verdict = Expr.judge(isBig, { row: { n: 9 } })
    expect(verdict).toMatchObject({
      _tag: 'Unknown',
      obligation: { value: { kind: 'unsupported', detail: 'app.double@1' } },
    })
  })
})

describe('SQL', () => {
  const rows = sqliteTable('rows', { id: text('id').primaryKey(), n: integer('n'), s: text('s') })
  const db = new DatabaseSync(':memory:')
  db.exec('CREATE TABLE "rows" ("id" TEXT PRIMARY KEY, "n" INTEGER, "s" TEXT)')
  for (const [id, n] of [
    ['a', 3],
    ['b', 6],
    ['c', null],
  ] as const) {
    db.prepare('INSERT INTO "rows" VALUES (?, ?, ?)').run(id, n, 'hi')
  }

  it('writes the SQL its table gives, with the parameters in place', () => {
    const table: Sql.ForeignSqlTable = {
      'app.double': {
        version: 1,
        sql: ([n]) => [
          Sql.SqlPiece.Text({ text: '(2 * ' }),
          ...n!,
          Sql.SqlPiece.Text({ text: ')' }),
        ],
      },
    }
    const where = Result.getOrThrow(Sql.toWhere(isBig, { dialect: 'sqlite', foreign: table }))
    expect(where.text).toBe('((2 * "n") > ?)')
    const found = db
      .prepare(`SELECT "id" FROM "rows" WHERE ${where.text}`)
      .all(...(where.params as Array<SQLInputValue>))
    expect(found.map(each => each['id'])).toEqual(['b'])
  })

  it('writes the Drizzle SQL its table gives', async () => {
    const table: Drizzle.ForeignDrizzle = {
      'app.double': { version: 1, sql: ([n]): SQL => drizzleSql`(2 * ${n})` },
    }
    const where = Result.getOrThrow(
      Drizzle.toWhere(isBig, rows, { dialect: 'sqlite', foreign: table }),
    )
    const found = await drizzle({ client: db }).select({ id: rows.id }).from(rows).where(where)
    expect(found.map(each => each.id)).toEqual(['b'])
  })

  it('refuses a call its table has no entry of that version for, naming it', () => {
    for (const foreign of [{}, { 'app.double': { version: 9, sql: () => [] } }]) {
      const where = Sql.toWhere(isBig, { dialect: 'sqlite', foreign })
      expect(Result.isFailure(where) && where.failure.reason).toContain('app.double@1')
    }
    expect(Result.isFailure(Drizzle.toWhere(isBig, rows, { dialect: 'sqlite' }))).toBe(true)
  })
})

describe('the checker and the solver', () => {
  const Strict = Schema.Struct({ n: Schema.Int })
  const s = Path.forSchema(Strict)
  const big = Ord.gt(call<typeof Strict.Type, number>(double, [s.n]), 10)

  it('answer Unknown, never True or False', async () => {
    expect(Abstract.checkInvariant(Strict, big)._tag).toBe('Unknown')
    expect(Abstract.checkInvariant(Strict, Eq.isNot(big, true))._tag).toBe('Unknown')
    const proof = await Effect.runPromise(Prove.invariant(Strict, big))
    expect(proof).toMatchObject({ _tag: 'Unknown', obligation: { value: { kind: 'unsupported' } } })
  }, 30_000)

  it('take a foreign predicate as no value, so a rule over it stays open', () => {
    const flag = Node.foreign({ id: 'app.flag', version: 1, returns: 'boolean', nulls: 'strict' })
    const flagged = call<typeof Strict.Type, boolean>(flag, [s.n])
    expect(Verdict.isTrue(Abstract.checkInvariant(Strict, Eq.is(flagged, flagged)))).toBe(false)
  })
})
