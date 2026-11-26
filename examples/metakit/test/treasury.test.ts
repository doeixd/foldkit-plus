import { PGlite } from '@electric-sql/pglite'
import { Effect, Option, Result } from 'effect'
import { describe, expect, it } from 'vitest'
import { Abstract, Transition, Verdict } from 'metakit'
import { Decimal, Money } from 'metakit/domain'
import * as Machine from 'metakit/machine'
import * as Pairs from 'metakit/pairs'
import * as Prove from 'metakit/prove'
import * as Sql from 'metakit/sql'
import * as Store from 'metakit/store'
import * as Temporal from 'metakit/temporal'
import {
  BuggyTreasuryMachine,
  CaptureHold,
  ChargeFxFee,
  Credit,
  Freeze,
  HoldFunds,
  ReleaseHold,
  TreasuryAccount,
  TreasuryMachine,
} from '../src/treasury/index.js'

const usd = (cents: number) => Money.minor('USD', cents)
const rate4 = (units: number) => Decimal.units(units, 4)

describe('Example 1: Treasury & FX Settlement Ledger', () => {
  it('runs credits, holds, captures, and half-even FX fee rounding', () => {
    const open = {
      id: 'acct-1',
      balance: usd(10_000),
      reserved: usd(0),
      creditLimit: usd(5_000),
      status: 'open' as const,
    }

    const afterCredit = Result.getOrThrow(
      Transition.step(Credit, open, { amount: usd(2_500) }, { settledAt: 1700000000 }),
    )
    expect(afterCredit.state.balance).toBe(12_500)
    expect(afterCredit.emitted).toEqual([
      { _tag: 'FundsCredited', accountId: 'acct-1', amount: 2_500, settledAt: 1700000000 },
    ])

    const afterHold = Result.getOrThrow(
      Transition.step(HoldFunds, afterCredit.state, { amount: usd(14_000) }),
    )
    expect(afterHold.state.reserved).toBe(14_000)

    const afterCapture = Result.getOrThrow(
      Transition.step(CaptureHold, afterHold.state, { amount: usd(14_000) }),
    )
    expect(afterCapture.state.balance).toBe(-1_500) // uses credit line
    expect(afterCapture.state.reserved).toBe(0)

    // 0.25% (25 / 10000) of 1002 cents = 2.505 -> half-even rounds to 3 cents;
    // 0.50% (50 / 10000) of 500 cents = 2.5 -> half-even rounds to 2 cents (even!)
    const afterFee = Result.getOrThrow(
      Transition.step(ChargeFxFee, afterCapture.state, {
        principal: usd(500),
        feeRate: rate4(50),
      }),
    )
    expect(afterFee.state.balance).toBe(-1_502)
    expect(afterFee.emitted).toEqual([{ _tag: 'FxFeeCharged', accountId: 'acct-1', fee: 2 }])
  })

  it('proves 3-variable transitions in Tier 4 Z3 and refutes BuggyCapture with a witness', async () => {
    // `reserved <= balance + creditLimit` is a 3-variable linear inequality,
    // so Tier 3 Zone escalates cleanly to Tier 4 Z3 which proves all 5 transitions.
    expect(Verdict.isTrue(Abstract.checkTransition(TreasuryAccount, Freeze))).toBe(true)

    const provedReport = await Effect.runPromise(
      Prove.machine(TreasuryMachine, {
        pin: ['Credit', 'HoldFunds', 'CaptureHold', 'ReleaseHold', 'Freeze'],
      }),
    )
    expect(provedReport.ok).toBe(true)

    const buggyReport = await Effect.runPromise(
      Prove.machine(BuggyTreasuryMachine, { pin: ['BuggyCapture'] }),
    )
    expect(buggyReport.ok).toBe(false)
    expect(buggyReport.entries[0]?.status).toBe('refuted')
    expect(Option.isSome(buggyReport.entries[0]!.witness)).toBe(true)
  })

  it('classifies commuting vs order-sensitive pairs and enforces store capabilities', () => {
    const pairs = Pairs.pairs(TreasuryMachine)
    const holdVsFreeze = pairs.find(p => p.name === 'HoldFunds/Freeze')
    expect(holdVsFreeze).toBeDefined()
    expect(Verdict.isUnknown(holdVsFreeze!.verdict)).toBe(true)

    const reqs = Temporal.requirements({ machine: TreasuryMachine })
    expect(reqs.length).toBeGreaterThan(0)

    const serializable: Store.StoreCapabilities = {
      name: 'Postgres (SERIALIZABLE)',
      isolation: 'serializable',
      isolates: 'transaction',
      parentRowLock: true,
    }
    const readCommitted: Store.StoreCapabilities = {
      name: 'Postgres (READ COMMITTED)',
      isolation: 'read-committed',
      isolates: 'transaction',
      parentRowLock: true,
    }
    const eventual: Store.StoreCapabilities = {
      name: 'EventualKV',
      isolation: 'eventual',
      parentRowLock: false,
    }
    // Read-first transitions need serializable transactions; guarded SQL UPDATEs
    // (`in-statement`) work under read-committed too, while eventual stores are refused.
    expect(() => Store.mount(serializable, reqs)).not.toThrow()
    expect(() => Store.mount(readCommitted, reqs)).toThrow(Store.StoreRefused)
    expect(() =>
      Store.mount(
        readCommitted,
        reqs.map(r => ({ ...r, judged: 'in-statement' as const })),
      ),
    ).not.toThrow()
    expect(() => Store.mount(eventual, reqs)).toThrow(Store.StoreRefused)
  })

  it('executes Sql.toCheck and Sql.toUpdate against a real PGlite database', async () => {
    const db = new PGlite()
    const check = Result.getOrThrow(Sql.toCheck(TreasuryAccount, { dialect: 'postgres' }))
    await db.exec(`
      CREATE TABLE accounts (
        id TEXT PRIMARY KEY,
        balance INTEGER NOT NULL,
        reserved INTEGER NOT NULL,
        "creditLimit" INTEGER NOT NULL,
        status TEXT NOT NULL,
        ${check}
      );
    `)
    await db.query(
      `INSERT INTO accounts (id, balance, reserved, "creditLimit", status) VALUES ($1, $2, $3, $4, $5)`,
      ['a1', 1000, 200, 500, 'open'],
    )
    // Violating reserved > balance + creditLimit is rejected by Postgres CHECK
    await expect(
      db.query(
        `INSERT INTO accounts (id, balance, reserved, "creditLimit", status) VALUES ($1, $2, $3, $4, $5)`,
        ['a2', 100, 700, 500, 'open'],
      ),
    ).rejects.toThrow()

    const update = Result.getOrThrow(
      Sql.toUpdate(
        'accounts',
        CaptureHold,
        { amount: usd(200) },
        { dialect: 'postgres', whereId: { column: 'id', value: 'a1' } },
      ),
    )
    await db.query(update.text, [...update.params])
    const rows = await db.query<{ balance: number; reserved: number }>(
      `SELECT balance, reserved FROM accounts WHERE id = 'a1'`,
    )
    expect(rows.rows).toEqual([{ balance: 800, reserved: 0 }])

    const aff = Machine.affordances(TreasuryMachine, {
      id: 'a1',
      balance: usd(800),
      reserved: usd(0),
      creditLimit: usd(500),
      status: 'frozen' as const,
    })
    expect(aff.disabled).toContain('HoldFunds')
    expect(aff.disabled).toContain('Freeze')
    expect(aff.available).toEqual([])
    await db.close()
  })
})
