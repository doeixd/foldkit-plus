/**
 * Example 1: Double-Entry Treasury & FX Settlement Ledger
 *
 * Exercises:
 * - `Domain.Money` & `Domain.Decimal` (`Money.mul` / `num.mulScaled` exact half-even rounding)
 * - `Transition.make` with `supplied`, `emits`, `Transition.add`, `Transition.set`
 * - `Abstract.checkTransition`, `Prove.machine` (Z3), and counterexample witnesses
 * - `Transition.commutes` & `Pairs.pairs`
 * - `Sql.toCheck` & `Sql.toUpdate` executed in PGlite
 * - `Temporal.requirements` & `Store.mount` capability enforcement
 */
import { Schema } from 'effect'
import { Eq, Expr, Num, Transition } from '@doeixd/metakit'
import { Decimal, Money } from '@doeixd/metakit/domain'
import * as Machine from '@doeixd/metakit/machine'

export const Usd = Money.make('USD')
export const Rate4 = Decimal.make({ scale: 4 })

const MAX_BALANCE = 1_000_000_000 // $10M in cents (safe for bounded integer proofs)

export const TreasuryAccount = Schema.Struct({
  id: Schema.String,
  balance: Usd.check(Schema.isBetween({ minimum: -100_000_000, maximum: MAX_BALANCE })),
  reserved: Usd.check(Schema.isBetween({ minimum: 0, maximum: MAX_BALANCE })),
  creditLimit: Usd.check(Schema.isBetween({ minimum: 0, maximum: 100_000_000 })),
  status: Schema.Literals(['open', 'frozen', 'closed']),
}).pipe(
  Expr.refine(
    $ =>
      Expr.all(
        Num.gte($.balance, Num.neg($.creditLimit)),
        Num.gte($.reserved, 0),
        Num.lte($.reserved, Num.add($.balance, $.creditLimit)),
      ),
    { message: 'reserved exceeds available balance plus credit limit' },
  ),
)
export type TreasuryAccount = typeof TreasuryAccount.Type

const PositiveAmount = Usd.check(Schema.isBetween({ minimum: 1, maximum: 10_000_000 }))

/** Credit incoming settled funds (bounded `add` so two concurrent credits commute). */
export const Credit = Transition.make({
  state: TreasuryAccount,
  input: Schema.Struct({ amount: PositiveAmount }),
  supplied: { settledAt: Schema.Int },
  when: ({ state, input }) =>
    Expr.all(
      Eq.is(state.status, 'open'),
      Num.lte(Num.add(state.balance, input.amount), MAX_BALANCE),
    ),
  apply: ({ state, input }) => [Transition.add(state.balance, input.amount)],
  emits: ({ state, input, supplied }) => [
    Transition.emit('FundsCredited', {
      accountId: state.id,
      amount: input.amount,
      settledAt: supplied.settledAt,
    }),
  ],
})

/** Place an authorization hold against available balance + credit line. */
export const HoldFunds = Transition.make({
  state: TreasuryAccount,
  input: Schema.Struct({ amount: PositiveAmount }),
  when: ({ state, input }) =>
    Expr.all(
      Eq.is(state.status, 'open'),
      Num.lte(Num.add(state.reserved, input.amount), Num.add(state.balance, state.creditLimit)),
      Num.lte(Num.add(state.reserved, input.amount), MAX_BALANCE),
    ),
  apply: ({ state, input }) => [Transition.add(state.reserved, input.amount)],
  emits: ({ state, input }) => [
    Transition.emit('HoldPlaced', { accountId: state.id, amount: input.amount }),
  ],
})

/** Capture a previously held amount, reducing both balance and reserved together. */
export const CaptureHold = Transition.make({
  state: TreasuryAccount,
  input: Schema.Struct({ amount: PositiveAmount }),
  when: ({ state, input }) =>
    Expr.all(
      Eq.is(state.status, 'open'),
      Num.lte(input.amount, state.reserved),
      Num.gte(Num.sub(state.balance, input.amount), Num.neg(state.creditLimit)),
    ),
  apply: ({ state, input }) => [
    Transition.set(state.balance, Money.sub(state.balance, input.amount)),
    Transition.set(state.reserved, Money.sub(state.reserved, input.amount)),
  ],
  emits: ({ state, input }) => [
    Transition.emit('HoldCaptured', { accountId: state.id, amount: input.amount }),
  ],
})

/** Release an authorization hold without debiting the balance. */
export const ReleaseHold = Transition.make({
  state: TreasuryAccount,
  input: Schema.Struct({ amount: PositiveAmount }),
  when: ({ state, input }) => Num.lte(input.amount, state.reserved),
  apply: ({ state, input }) => [
    Transition.set(state.reserved, Money.sub(state.reserved, input.amount)),
  ],
})

/** Charge a percentage FX fee using exact half-even `Money.mul` (`num.mulScaled`). */
export const ChargeFxFee = Transition.make({
  state: TreasuryAccount,
  input: Schema.Struct({
    principal: PositiveAmount,
    feeRate: Rate4.check(Schema.isBetween({ minimum: 1, maximum: 500 })), // 0.01% .. 5.00%
  }),
  when: ({ state, input }) => {
    const fee = Money.mul(input.principal, input.feeRate)
    return Expr.all(
      Eq.is(state.status, 'open'),
      Num.lte(fee, Num.sub(Num.add(state.balance, state.creditLimit), state.reserved)),
    )
  },
  apply: ({ state, input }) => [
    Transition.set(
      state.balance,
      Money.sub(state.balance, Money.mul(input.principal, input.feeRate)),
    ),
  ],
  emits: ({ state, input }) => [
    Transition.emit('FxFeeCharged', {
      accountId: state.id,
      fee: Money.mul(input.principal, input.feeRate),
    }),
  ],
})

export const Freeze = Transition.make({
  state: TreasuryAccount,
  input: Schema.Struct({}),
  when: ({ state }) => Eq.is(state.status, 'open'),
  apply: ({ state }) => [Transition.set(state.status, 'frozen')],
})

/** Deliberately buggy capture that forgets to reduce `reserved` — caught by Z3. */
export const BuggyCapture = Transition.make({
  state: TreasuryAccount,
  input: Schema.Struct({ amount: PositiveAmount }),
  when: ({ state, input }) =>
    Expr.all(
      Eq.is(state.status, 'open'),
      Num.lte(input.amount, state.reserved),
      Num.gte(Num.sub(state.balance, input.amount), Num.neg(state.creditLimit)),
    ),
  apply: ({ state, input }) => [
    Transition.set(state.balance, Money.sub(state.balance, input.amount)),
  ],
})

export const TreasuryMachine = Machine.make({
  state: TreasuryAccount,
  transitions: { Credit, HoldFunds, CaptureHold, ReleaseHold, ChargeFxFee, Freeze },
})

export const BuggyTreasuryMachine = Machine.make({
  state: TreasuryAccount,
  transitions: { BuggyCapture },
})
