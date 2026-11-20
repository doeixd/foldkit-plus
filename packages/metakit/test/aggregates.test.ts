import { PGlite } from '@electric-sql/pglite'
import { Effect, Option, Result, Schema } from 'effect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Eq, Expr, Num, Ord, Transition, Verdict } from 'metakit'
import * as Rows from 'metakit/aggregates'
import * as Prove from 'metakit/prove'

const Entry = Schema.Struct({
  id: Schema.String,
  amount: Schema.Int,
  settled: Schema.Boolean,
})
type Entry = typeof Entry.Type

const TotalAmount = Rows.sum(Entry, $ => $.amount)
const SettledCount = Rows.count(Entry, $ => $.settled)
const MinAmount = Rows.min(Entry, $ => $.amount)
const MaxAmount = Rows.max(Entry, $ => $.amount)
const AllSettled = Rows.every(Entry, $ => $.settled)
const AnyPositive = Rows.any(Entry, $ => Ord.gt($.amount, 0))

let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE TABLE "entries" (
      "id" TEXT PRIMARY KEY,
      "amount" INTEGER NOT NULL,
      "settled" BOOLEAN NOT NULL
    );
  `)
})

afterAll(async () => {
  await db.close()
})

describe('metakit/aggregates (group vs semilattice)', () => {
  it('tags group vs semilattice algebraic structure and verifies O(1) IVM deltas', () => {
    expect(TotalAmount.algebra).toBe('group')
    expect(TotalAmount.requiresRescanOnDelete).toBe(false)
    expect(SettledCount.algebra).toBe('group')
    expect(MinAmount.algebra).toBe('semilattice')
    expect(MinAmount.requiresRescanOnDelete).toBe(true)
    expect(MaxAmount.algebra).toBe('semilattice')
    expect(AllSettled.algebra).toBe('semilattice')
    expect(AnyPositive.algebra).toBe('semilattice')

    // O(1) incremental maintenance of Abelian group aggregates matches full recompute
    let list: Array<Entry> = []
    let sumAcc = TotalAmount.identity
    let countAcc = SettledCount.identity

    const e1: Entry = { id: 'e1', amount: 100, settled: true }
    const e2: Entry = { id: 'e2', amount: -30, settled: false }
    const e2Updated: Entry = { id: 'e2', amount: -20, settled: true }

    list.push(e1)
    sumAcc += TotalAmount.insertDelta(e1)
    countAcc += SettledCount.insertDelta(e1)
    expect(sumAcc).toBe(TotalAmount.evaluate(list))
    expect(countAcc).toBe(SettledCount.evaluate(list))

    list.push(e2)
    sumAcc += TotalAmount.insertDelta(e2)
    countAcc += SettledCount.insertDelta(e2)
    expect(sumAcc).toBe(TotalAmount.evaluate(list))
    expect(countAcc).toBe(SettledCount.evaluate(list))

    // Update
    list = [e1, e2Updated]
    sumAcc += TotalAmount.updateDelta(e2, e2Updated)
    countAcc += SettledCount.updateDelta(e2, e2Updated)
    expect(sumAcc).toBe(TotalAmount.evaluate(list))
    expect(countAcc).toBe(SettledCount.evaluate(list))

    // Delete
    list = [e2Updated]
    sumAcc += TotalAmount.deleteDelta(e1)
    countAcc += SettledCount.deleteDelta(e1)
    expect(sumAcc).toBe(TotalAmount.evaluate(list))
    expect(countAcc).toBe(SettledCount.evaluate(list))
  })

  it('matches PGlite SQL execution across sum, count, min, max, every, and any', async () => {
    const sample: ReadonlyArray<Entry> = [
      { id: 'e1', amount: 100, settled: true },
      { id: 'e2', amount: -25, settled: false },
      { id: 'e3', amount: 40, settled: true },
    ]
    for (const r of sample) {
      await db.query(`INSERT INTO "entries" ("id", "amount", "settled") VALUES ($1, $2, $3)`, [
        r.id,
        r.amount,
        r.settled,
      ])
    }

    const qSum = TotalAmount.toSql()
    const qCnt = SettledCount.toSql()
    const qMin = MinAmount.toSql()
    const qMax = MaxAmount.toSql()
    const qEvery = AllSettled.toSql()
    const qAny = AnyPositive.toSql()
    if (
      Result.isFailure(qSum) ||
      Result.isFailure(qCnt) ||
      Result.isFailure(qMin) ||
      Result.isFailure(qMax) ||
      Result.isFailure(qEvery) ||
      Result.isFailure(qAny)
    ) {
      throw new Error('SQL lowering failed')
    }

    const res = await db.query<{
      s: number
      c: number
      lo: number
      hi: number
      ev: boolean
      an: boolean
    }>(
      `SELECT ${qSum.success.text}::INTEGER AS s, ${qCnt.success.text} AS c, ${qMin.success.text} AS lo, ${qMax.success.text} AS hi, ${qEvery.success.text} AS ev, ${qAny.success.text} AS an FROM "entries"`,
      [...qAny.success.params],
    )
    const row = res.rows[0]!
    expect(row.s).toBe(TotalAmount.evaluate(sample))
    expect(row.c).toBe(SettledCount.evaluate(sample))
    expect(Option.some(row.lo)).toEqual(MinAmount.evaluate(sample))
    expect(Option.some(row.hi)).toEqual(MaxAmount.evaluate(sample))
    expect(row.ev).toBe(AllSettled.evaluate(sample))
    expect(row.an).toBe(AnyPositive.evaluate(sample))
  })

  it('proves unbounded balance conservation (balance == sum(entries)) via group delta in Z3', async () => {
    // Parent Account + materialised aggregate `entriesSum`:
    // Invariant: balance === entriesSum && balance >= 0
    const LedgerAccount = Schema.Struct({
      balance: Schema.Int,
      entriesSum: Schema.Int,
    }).pipe(Expr.refine($ => Expr.all(Eq.is($.balance, $.entriesSum), Ord.gte($.balance, 0))))

    // Posting a new ledger entry adds its symbolic group delta to both balance and entriesSum
    const PostEntry = Transition.make({
      state: LedgerAccount,
      input: Entry,
      when: ({ state, input }) => Ord.gte(Num.add(state.balance, input.amount), 0),
      apply: ({ state, input }) => [
        Transition.set(state.balance, Num.add(state.balance, input.amount)),
        Transition.set(
          state.entriesSum,
          Num.add(state.entriesSum, Expr.lift(input, TotalAmount.contribution)),
        ),
      ],
    })

    const verdict = await Effect.runPromise(Prove.transition(LedgerAccount, PostEntry))
    expect(Verdict.isTrue(verdict)).toBe(true)
  }, 30_000)
})
