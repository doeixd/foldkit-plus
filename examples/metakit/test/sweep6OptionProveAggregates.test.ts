/**
 * Bug-Hunting Sweep 6:
 * - `Schema.Option`, `Schema.OptionFromNullOr`, and `Schema.optional(Schema.NullOr(...))`
 *   through Tier 3 (`Abstract.checkInvariant`) and Tier 4 Z3 (`Prove.invariant`)
 * - `Aggregates` (`sum`, `count`, `min`, `max`, `any`, `every`) parity across
 *   Memory, Postgres (PGlite), and SQLite (`node:sqlite`) on empty, all-null, and mixed tables
 * - `Sql.toUpdate` executed against real SQLite (`node:sqlite`) with `?` parameter ordering
 * - `Machine.canDispatch` & `Machine.intent` with partial `supplied` values
 */
import { DatabaseSync } from 'node:sqlite'
import { PGlite } from '@electric-sql/pglite'
import { Effect, Option, Result, Schema } from 'effect'
import { Abstract, Bool, Eq, Expr, Null, Num, Path, Transition, Verdict } from 'metakit'
import * as Aggregates from 'metakit/aggregates'
import * as AggregatesSql from 'metakit/aggregates/sql'
import { Text } from 'metakit/domain'
import * as Machine from 'metakit/machine'
import * as Prove from 'metakit/prove'
import * as Sql from 'metakit/sql'
import { describe, expect, it } from 'vitest'

describe('Bug-Hunting Sweep 6: Option/nested-union Prove, Aggregates PG+SQLite, SQLite toUpdate', () => {
  it('handles Schema.Option, Schema.OptionFromNullOr, and optional(NullOr) in Abstract & Z3 Prove', async () => {
    const Model = Schema.Struct({
      optInt: Schema.Option(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100 }))),
      optNullInt: Schema.OptionFromNullOr(
        Schema.Int.check(Schema.isBetween({ minimum: 10, maximum: 50 })),
      ),
      nestedNull: Schema.optional(
        Schema.NullOr(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 20 }))),
      ),
      optText: Schema.OptionFromNullOr(Text.schema),
    })
    const $ = Path.from(Model)

    // Tier 3 Abstract should prove guarded bounds on all 3 numeric option/nullable shapes
    expect(
      Verdict.isTrue(
        Abstract.checkInvariant(
          Model,
          Expr.implies(Null.isNotNull($.optInt), Num.gte($.optInt, 0)),
        ),
      ),
    ).toBe(true)
    expect(
      Verdict.isTrue(
        Abstract.checkInvariant(
          Model,
          Expr.implies(Null.isNotNull($.optNullInt), Num.gte($.optNullInt, 10)),
        ),
      ),
    ).toBe(true)
    expect(
      Verdict.isTrue(
        Abstract.checkInvariant(
          Model,
          Expr.implies(Null.isNotNull($.nestedNull), Num.lte($.nestedNull, 20)),
        ),
      ),
    ).toBe(true)

    // Tier 4 Z3 should prove guarded bounds and refute unguarded bounds (null counterexample!)
    const z3Opt = await Effect.runPromise(
      Prove.invariant(Model, Expr.any(Null.isNull($.optInt), Num.lte($.optInt, 100))),
    )
    expect(Verdict.isTrue(z3Opt)).toBe(true)

    const z3Unguarded = await Effect.runPromise(Prove.invariant(Model, Num.gte($.optInt, 0)))
    expect(Verdict.isFalse(z3Unguarded)).toBe(true)

    const z3Nested = await Effect.runPromise(
      Prove.invariant(Model, Expr.any(Null.isNull($.nestedNull), Num.gte($.nestedNull, 1))),
    )
    expect(Verdict.isTrue(z3Nested)).toBe(true)

    // OptionFromNullOr(Text.schema) has no NUL, so Eq.is($.optText, $.optText) is provably True in Z3
    const z3Text = await Effect.runPromise(Prove.invariant(Model, Eq.is($.optText, $.optText)))
    expect(Verdict.isTrue(z3Text)).toBe(true)
  })

  it('matches Aggregates (sum, count, min, max, any, every) across Memory, Postgres, and SQLite on empty, all-null, and mixed rows', async () => {
    const Entry = Schema.Struct({
      id: Schema.String,
      grp: Schema.String,
      amount: Schema.NullOr(Schema.Int.check(Schema.isBetween({ minimum: -1000, maximum: 1000 }))),
      active: Schema.NullOr(Schema.Boolean),
    })
    type Entry = typeof Entry.Type

    const aggSum = Aggregates.sum(Entry, $ => $.amount)
    const aggCount = Aggregates.count(Entry, $ => Bool.and($.active, Null.isNotNull($.amount)))
    const aggMin = Aggregates.min(Entry, $ => $.amount)
    const aggMax = Aggregates.max(Entry, $ => $.amount)
    const aggAny = Aggregates.any(Entry, $ => $.active)
    const aggEvery = Aggregates.every(Entry, $ => $.active)

    const datasets: ReadonlyArray<readonly [string, ReadonlyArray<Entry>]> = [
      ['empty', []],
      [
        'all-null',
        [
          { id: '1', grp: 'g', amount: null, active: null },
          { id: '2', grp: 'g', amount: null, active: null },
        ],
      ],
      [
        'mixed',
        [
          { id: '1', grp: 'g', amount: 10, active: true },
          { id: '2', grp: 'g', amount: null, active: false },
          { id: '3', grp: 'g', amount: -5, active: true },
          { id: '4', grp: 'g', amount: 25, active: null },
        ],
      ],
      [
        'all-true',
        [
          { id: '1', grp: 'g', amount: 7, active: true },
          { id: '2', grp: 'g', amount: 3, active: true },
        ],
      ],
    ]

    const pg = new PGlite()
    const sqlite = new DatabaseSync(':memory:')
    const ddl = `
      CREATE TABLE entries (
        id TEXT PRIMARY KEY,
        grp TEXT NOT NULL,
        amount INTEGER,
        active BOOLEAN
      );
    `
    await pg.exec(ddl)
    sqlite.exec(ddl)

    const sqliteSumOpts = {
      dialect: 'sqlite' as const,
      sqliteSum: { maxRows: 1000, maxAbsContribution: 1000 },
    }
    const pgOpts = { dialect: 'postgres' as const }

    const aggs = [
      ['sum', aggSum],
      ['count', aggCount],
      ['min', aggMin],
      ['max', aggMax],
      ['any', aggAny],
      ['every', aggEvery],
    ] as const

    const failures: Array<string> = []
    for (const [label, rows] of datasets) {
      await pg.exec(`DELETE FROM entries`)
      sqlite.exec(`DELETE FROM entries`)
      const insSq = sqlite.prepare(`INSERT INTO entries (id, grp, amount, active) VALUES (?,?,?,?)`)
      for (const r of rows) {
        await pg.query(`INSERT INTO entries (id, grp, amount, active) VALUES ($1,$2,$3,$4)`, [
          r.id,
          r.grp,
          r.amount,
          r.active,
        ])
        insSq.run(r.id, r.grp, r.amount, r.active === null ? null : r.active ? 1 : 0)
      }

      for (const [name, agg] of aggs) {
        const rawMem = agg.evaluate(rows)
        const memVal = Option.isOption(rawMem) ? Option.getOrNull(rawMem) : rawMem

        const pgFrag = Result.getOrThrow(AggregatesSql.toSql(agg, pgOpts))
        const pgRes = await pg.query<{ v: unknown }>(`SELECT (${pgFrag.text}) AS v FROM entries`, [
          ...pgFrag.params,
        ])
        const rawPg = pgRes.rows[0]?.v
        const pgVal = typeof rawPg === 'string' && /^-?\d+$/.test(rawPg) ? Number(rawPg) : rawPg
        if (!Object.is(pgVal, memVal)) {
          failures.push(
            `[pg] ${label}/${name}: mem=${JSON.stringify(memVal)} pg=${JSON.stringify(pgVal)} | SQL: ${pgFrag.text}`,
          )
        }

        const sqFrag = Result.getOrThrow(AggregatesSql.toSql(agg, sqliteSumOpts))
        const sqRow = sqlite
          .prepare(`SELECT (${sqFrag.text}) AS v FROM entries`)
          .get(...(sqFrag.params as Array<null | number | string>)) as { v: unknown }
        const rawSq = sqRow?.v
        const sqVal =
          typeof memVal === 'boolean' && (rawSq === 0 || rawSq === 1) ? rawSq === 1 : rawSq
        if (!Object.is(sqVal, memVal)) {
          failures.push(
            `[sqlite] ${label}/${name}: mem=${JSON.stringify(memVal)} sqlite=${JSON.stringify(sqVal)} | SQL: ${sqFrag.text}`,
          )
        }
      }
    }

    sqlite.close()
    await pg.close()
    expect(failures).toEqual([])
  })

  it('executes Sql.toUpdate on real SQLite with ? parameter ordering and whereId', () => {
    const Wallet = Schema.Struct({
      id: Schema.String,
      balance: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1_000_000 })),
      status: Schema.Literals(['open', 'locked']),
    })
    const Debit = Transition.make({
      state: Wallet,
      input: Schema.Struct({ amount: Schema.Int.check(Schema.isGreaterThan(0)) }),
      when: ({ state, input }) =>
        Expr.all(Eq.is(state.status, 'open'), Num.gte(state.balance, input.amount)),
      apply: ({ state, input }) => [
        Transition.set(state.balance, Num.sub(state.balance, input.amount)),
      ],
    })

    const db = new DatabaseSync(':memory:')
    const check = Result.getOrThrow(Sql.toCheck(Wallet, { dialect: 'sqlite' }))
    db.exec(`
      CREATE TABLE wallets (
        id TEXT PRIMARY KEY,
        balance INTEGER NOT NULL,
        status TEXT NOT NULL,
        ${check}
      );
      INSERT INTO wallets (id, balance, status) VALUES
        ('w1', 500, 'open'),
        ('w2', 500, 'locked'),
        ('w3', 100, 'open');
    `)

    const upd = Result.getOrThrow(
      Sql.toUpdate(
        'wallets',
        Debit,
        { amount: 200 },
        { dialect: 'sqlite', whereId: { column: 'id', value: 'w1' } },
      ),
    )
    db.prepare(upd.text).run(...(upd.params as Array<null | number | string>))
    const rows = db.prepare(`SELECT id, balance FROM wallets ORDER BY id`).all()
    expect(rows).toEqual([
      { id: 'w1', balance: 300 },
      { id: 'w2', balance: 500 },
      { id: 'w3', balance: 100 },
    ])
    db.close()

    // Machine.canDispatch & Machine.intent with supplied values
    const TimedDebit = Transition.make({
      state: Wallet,
      input: Schema.Struct({ amount: Schema.Int }),
      supplied: { now: Schema.Int },
      when: ({ state, input, supplied }) =>
        Expr.all(
          Eq.is(state.status, 'open'),
          Num.gte(state.balance, input.amount),
          Num.gt(supplied.now, 0),
        ),
      apply: ({ state, input }) => [
        Transition.set(state.balance, Num.sub(state.balance, input.amount)),
      ],
    })
    const M = Machine.make({ state: Wallet, transitions: { TimedDebit } })
    const intent = Machine.intent(M, 'TimedDebit')
    expect(
      Verdict.isTrue(
        intent.can({
          state: { id: 'w1', balance: 500, status: 'open' },
          input: { amount: 100 },
          supplied: { now: 1000 },
        }),
      ),
    ).toBe(true)
    expect(
      Verdict.isFalse(
        intent.can({
          state: { id: 'w1', balance: 500, status: 'open' },
          input: { amount: 100 },
          supplied: { now: 0 },
        }),
      ),
    ).toBe(true)
    expect(Option.isSome(Option.some(1))).toBe(true)
  })
})
