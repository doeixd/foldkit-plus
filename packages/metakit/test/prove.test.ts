import { Effect, Option, Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Eq, Expr, Num, Path, Transition, Verdict } from 'metakit'
import * as Prove from 'metakit/prove'

const Account = Schema.Struct({
  id: Schema.String,
  balance: Schema.Int,
  reserved: Schema.Int,
  status: Schema.Literals(['open', 'frozen']),
}).pipe(
  Expr.refine($ =>
    Expr.all(Num.gte($.balance, 0), Num.gte($.reserved, 0), Num.lte($.reserved, $.balance)),
  ),
)

const WithdrawInput = Schema.Struct({
  amount: Schema.Int.pipe(Expr.refine($ => Num.gt($, 0))),
})

const Withdraw = Transition.make({
  state: Account,
  input: WithdrawInput,
  when: ({ state, input }) =>
    Expr.all(
      Eq.is(state.status, 'open'),
      Num.lte(input.amount, Num.sub(state.balance, state.reserved)),
    ),
  apply: ({ state, input }) => [
    Transition.set(state.balance, Num.sub(state.balance, input.amount)),
  ],
})

const BuggyWithdraw = Transition.make({
  state: Account,
  input: WithdrawInput,
  // Bug: checks amount <= balance instead of amount <= balance - reserved!
  when: ({ state, input }) =>
    Expr.all(Eq.is(state.status, 'open'), Num.lte(input.amount, state.balance)),
  apply: ({ state, input }) => [
    Transition.set(state.balance, Num.sub(state.balance, input.amount)),
  ],
})

describe('metakit/prove (Tier 3 Zone -> Tier 4 Z3 escalation)', () => {
  it('proves Withdraw synchronously in Tier 3 (Zone) without needing Z3', async () => {
    const verdict = await Effect.runPromise(Prove.transition(Account, Withdraw))
    expect(Verdict.isTrue(verdict)).toBe(true)
    if (Verdict.isTrue(verdict)) {
      expect(verdict.evidence).toEqual(Option.some(Verdict.Proved('zone')))
    }
  })

  it('refutes BuggyWithdraw in Z3 with a concrete counterexample witness', async () => {
    const verdict = await Effect.runPromise(Prove.transition(Account, BuggyWithdraw))
    expect(Verdict.isFalse(verdict)).toBe(true)
    if (Verdict.isFalse(verdict)) {
      expect(Option.isSome(verdict.witness)).toBe(true)
      if (Option.isSome(verdict.witness)) {
        const w = verdict.witness.value
        const state = {
          id: 'w',
          balance: w['state.balance'] as number,
          reserved: w['state.reserved'] as number,
          status: w['state.status'] as 'open' | 'frozen',
        }
        const input = { amount: w['input.amount'] as number }
        // The witness is a valid pre-state and valid input
        expect(Result.isSuccess(Schema.decodeUnknownResult(Account)(state))).toBe(true)
        expect(Result.isSuccess(Schema.decodeUnknownResult(WithdrawInput)(input))).toBe(true)
        // The buggy transition accepts it, and the post-state VIOLATES Account's invariant!
        const next = Transition.run(BuggyWithdraw, state, input)
        expect(Result.isSuccess(next)).toBe(true)
        if (Result.isSuccess(next)) {
          expect(Result.isFailure(Schema.decodeUnknownResult(Account)(next.success))).toBe(true)
        }
      }
    }
  }, 30_000)

  it('escalates to Z3 for multi-variable linear invariants beyond Zone', async () => {
    const Ledger = Schema.Struct({
      a: Schema.Int,
      b: Schema.Int,
      c: Schema.Int,
    }).pipe(
      Expr.refine($ => Expr.all(Num.gte($.a, 0), Num.gte($.b, 0), Num.lte(Num.add($.a, $.b), $.c))),
    )
    const $ = Path.forSchema(Ledger)
    // 2*a + 2*b <= 2*c: needs Z3 linear arithmetic
    const goal = Num.lte(Num.add(Num.mul(2, $.a), Num.mul(2, $.b)), Num.mul(2, $.c))
    const verdict = await Effect.runPromise(Prove.invariant(Ledger, goal))
    expect(Verdict.isTrue(verdict)).toBe(true)
    if (Verdict.isTrue(verdict)) {
      expect(verdict.evidence).toEqual(Option.some(Verdict.Proved('z3')))
    }
  }, 30_000)

  it('proves policy implications using Schema invariants as hypotheses automatically', async () => {
    const Principal = Schema.Struct({ role: Schema.Literals(['admin', 'guest']) })
    const Goal = Expr.in({ row: Account, principal: Principal }, ({ row }) =>
      Num.gte(Num.sub(row.balance, row.reserved), 0),
    )
    const verdict = await Effect.runPromise(
      Prove.policy({ row: Account, principal: Principal }, Goal),
    )
    expect(Verdict.isTrue(verdict)).toBe(true)
  }, 30_000)

  it('returns Unknown (never bogus False) when a Z3 counterexample relies on an Opaque term', async () => {
    const AlwaysTrueOpaque = Expr.in({ row: Account }, () =>
      Expr.opaque({ name: 'alwaysTrue' }, () => true),
    )
    const verdict = await Effect.runPromise(Prove.policy({ row: Account }, AlwaysTrueOpaque))
    expect(Verdict.isUnknown(verdict)).toBe(true)
  }, 30_000)

  it('catches violations of built-in Schema numeric checks on post-states', async () => {
    const Counter = Schema.Struct({
      count: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    })
    const DecrementUnchecked = Transition.make({
      state: Counter,
      input: Schema.Struct({}),
      apply: ({ state }) => [Transition.set(state.count, Num.sub(state.count, 1))],
    })
    const verdict = await Effect.runPromise(Prove.transition(Counter, DecrementUnchecked))
    expect(Verdict.isFalse(verdict)).toBe(true)
  }, 30_000)
})
