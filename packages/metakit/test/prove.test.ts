import { Effect, Option, Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Eq, Expr, Null, Num, Ord, Path, Transition, Verdict } from '@doeixd/metakit'
import * as Machine from '@doeixd/metakit/machine'
import * as Prove from '@doeixd/metakit/prove'

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
    const ledger = (ceiling: number) =>
      Schema.Struct({ a: Schema.Int, b: Schema.Int, c: Schema.Int }).pipe(
        Expr.refine($ =>
          Expr.all(
            Num.gte($.a, 0),
            Num.gte($.b, 0),
            Num.lte(Num.add($.a, $.b), $.c),
            Num.lte($.c, ceiling),
          ),
        ),
      )
    // 2*a + 2*b <= 2*c: needs Z3 linear arithmetic
    const doubled = (Ledger: ReturnType<typeof ledger>) => {
      const $ = Path.forSchema(Ledger)
      return Num.lte(Num.add(Num.mul(2, $.a), Num.mul(2, $.b)), Num.mul(2, $.c))
    }
    const Bounded = ledger(1_000_000)
    expect(await Effect.runPromise(Prove.invariant(Bounded, doubled(Bounded)))).toEqual(
      Verdict.True(
        Option.some(
          Verdict.Proved('z3', {
            backend: 'z3',
            encoding: 'metakit-smt-v1',
          }),
        ),
      ),
    )

    // With no ceiling `2 * c` can pass 2^53 - 1, where evaluation refuses and the goal does not hold.
    const Open = ledger(Number.MAX_SAFE_INTEGER)
    const refuted = await Effect.runPromise(Prove.invariant(Open, doubled(Open)))
    const witness = Verdict.isFalse(refuted) ? Option.getOrThrow(refuted.witness) : {}
    expect(Schema.is(Open)(witness)).toBe(true)
    expect(Result.isFailure(Expr.evalResult(doubled(Open), witness as typeof Open.Type))).toBe(true)
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

  it('proves null.isNull / Null.isNotNull and derived Num.clamp in Z3', async () => {
    const Modal = Schema.Struct({
      open: Schema.Boolean,
      editingId: Schema.NullOr(Schema.String),
      score: Schema.Int,
    }).pipe(Expr.refine($ => Expr.implies($.open, Null.isNotNull($.editingId))))
    const $ = Path.forSchema(Modal)
    // If editingId is null, modal cannot be open
    const v1 = await Effect.runPromise(
      Prove.invariant(Modal, Expr.implies(Null.isNull($.editingId), Expr.not($.open))),
    )
    expect(Verdict.isTrue(v1)).toBe(true)
    // Derived Num.clamp(score, 0, 100) is always between 0 and 100
    const v2 = await Effect.runPromise(
      Prove.invariant(Modal, Ord.between(Num.clamp($.score, 0, 100), 0, 100)),
    )
    expect(Verdict.isTrue(v2)).toBe(true)
  }, 30_000)

  it('Prove.machine: verifies valid machines, formats witnesses, enforces pinning & allowUnknown', async () => {
    const Freeze = Transition.make({
      state: Account,
      input: Schema.Struct({}),
      when: ({ state }) => Eq.is(state.status, 'open'),
      apply: ({ state }) => [Transition.set(state.status, 'frozen')],
    })
    const GoodMachine = Machine.make({
      state: Account,
      transitions: { Withdraw, Freeze },
    })
    const good = await Effect.runPromise(
      Prove.machine(GoodMachine, { pin: ['Withdraw', 'Freeze'] }),
    )
    expect(good.ok).toBe(true)
    expect(good.entries.every(e => e.status === 'proved')).toBe(true)
    expect(good.format()).toContain('PROVED (zone) Withdraw [pinned]')

    // Refuted machine produces structured WitnessReport + pasteable reproducer
    const BadMachine = Machine.make({
      state: Account,
      transitions: { BuggyWithdraw },
    })
    const bad = await Effect.runPromise(Prove.machine(BadMachine))
    expect(bad.ok).toBe(false)
    expect(bad.entries[0]!.status).toBe('refuted')
    expect(Option.isSome(bad.entries[0]!.witness)).toBe(true)
    if (Option.isSome(bad.entries[0]!.witness)) {
      const w = bad.entries[0]!.witness.value
      expect(w.violated.length).toBeGreaterThan(0)
      expect(w.reproducer).toContain('Transition.run(BuggyWithdraw,')
    }
    expect(bad.format()).toContain('REFUTED BuggyWithdraw')

    // Opaque transition: fails in strict mode, passes with explicit allowUnknown, fails if pinned
    const CustomOpaque = Transition.make({
      state: Account,
      input: Schema.Struct({}),
      when: () => Expr.opaque({ name: 'externalCheck' }, () => true),
      apply: ({ state }) => [Transition.set(state.balance, Num.sub(state.balance, 1))],
    })
    const OpaqueMachine = Machine.make({
      state: Account,
      transitions: { Withdraw, CustomOpaque },
    })
    const strictFail = await Effect.runPromise(Prove.machine(OpaqueMachine))
    expect(strictFail.ok).toBe(false)

    const allowedOk = await Effect.runPromise(
      Prove.machine(OpaqueMachine, {
        pin: ['Withdraw'],
        allowUnknown: { CustomOpaque: 'verified by external ledger' },
      }),
    )
    expect(allowedOk.ok).toBe(true)
    expect(allowedOk.format()).toContain('UNDECIDED (allowed: verified by external ledger)')

    const pinBroken = await Effect.runPromise(
      Prove.machine(OpaqueMachine, {
        pin: ['CustomOpaque'],
        strict: false,
      }),
    )
    expect(pinBroken.ok).toBe(false)
    expect(pinBroken.entries.find(e => e.tag === 'CustomOpaque')?.pinBroken).toBe(true)

    // Contradictory pin + allowUnknown for the same transition throws immediately
    expect(() =>
      Prove.machine(OpaqueMachine, {
        pin: ['CustomOpaque'],
        allowUnknown: { CustomOpaque: 'verified by external ledger' },
      }),
    ).toThrow(/both pin and allowUnknown/)

    // Blank allowUnknown reason throws immediately
    expect(() => Prove.machine(OpaqueMachine, { allowUnknown: { CustomOpaque: '   ' } })).toThrow(
      /non-empty reason/,
    )
  }, 30_000)
})
