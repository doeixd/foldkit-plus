/**
 * Bug-Hunting Sweep 7: Formal Verification & Theorem-Proving Torture Suite
 *
 * Pushes Tier 3 (Zone) and Tier 4 (Z3) on:
 * 1. Conservation of money across two-account atomic transfers (`Prove.machine` + `Abstract.checkGoal`)
 * 2. IEEE-754 floating-point laws (`Schema.Finite` -> Z3 Float64): proves small-range laws, refutes float precision loss!
 * 3. Integer division & remainder identities (`num.div`, `num.rem`, all rounding modes)
 * 4. Calendar & Time laws (`daysBetween`/`addDays` inverse, `overlaps` symmetry, `startOfMonth <= d`)
 * 5. String length laws (`len(concat(a, b)) == len(a) + len(b)`, `len(trim(a)) <= len(a)`)
 * 6. Security policy theorems (separation of duties + cross-tenant escalation counterexample)
 */
import { Effect, Option, Result, Schema } from 'effect'
import {
  Abstract,
  Bool,
  Eq,
  Expr,
  Null,
  Num,
  Path,
  Str,
  Time,
  Transition,
  Verdict,
} from '@doeixd/metakit'
import { CalendarDay, Money, Text } from '@doeixd/metakit/domain'
import * as Machine from '@doeixd/metakit/machine'
import * as Policy from '@doeixd/metakit/policy'
import * as Prove from '@doeixd/metakit/prove'
import { describe, expect, it } from 'vitest'

const Usd = Money.make('USD')
const day = (iso: string) => Result.getOrThrow(CalendarDay.fromIso(iso))

describe('Bug-Hunting Sweep 7: Theorem Proving & Formal Verification', () => {
  it('proves conservation of money across two-account transfers and refutes leaky fee transfer', async () => {
    const Ledger = Schema.Struct({
      a: Usd.check(Schema.isBetween({ minimum: 0, maximum: 1_000_000 })),
      b: Usd.check(Schema.isBetween({ minimum: 0, maximum: 1_000_000 })),
      supply: Usd.check(Schema.isBetween({ minimum: 0, maximum: 2_000_000 })),
    }).pipe(Expr.refine($ => Eq.is(Num.add($.a, $.b), $.supply)))

    const TransferAtoB = Transition.make({
      state: Ledger,
      input: Schema.Struct({
        amount: Usd.check(Schema.isBetween({ minimum: 1, maximum: 1_000_000 })),
      }),
      when: ({ state, input }) =>
        Expr.all(
          Num.lte(input.amount, state.a),
          Num.lte(Num.add(state.b, input.amount), 1_000_000),
        ),
      apply: ({ state, input }) => [
        Transition.set(state.a, Money.sub(state.a, input.amount)),
        Transition.set(state.b, Money.add(state.b, input.amount)),
      ],
    })

    const TransferBtoA = Transition.make({
      state: Ledger,
      input: Schema.Struct({
        amount: Usd.check(Schema.isBetween({ minimum: 1, maximum: 1_000_000 })),
      }),
      when: ({ state, input }) =>
        Expr.all(
          Num.lte(input.amount, state.b),
          Num.lte(Num.add(state.a, input.amount), 1_000_000),
        ),
      apply: ({ state, input }) => [
        Transition.set(state.b, Money.sub(state.b, input.amount)),
        Transition.set(state.a, Money.add(state.a, input.amount)),
      ],
    })

    const M = Machine.make({ state: Ledger, transitions: { TransferAtoB, TransferBtoA } })
    const report = await Effect.runPromise(
      Prove.machine(M, { pin: ['TransferAtoB', 'TransferBtoA'] }),
    )
    expect(report.ok).toBe(true)

    // Buggy transfer that burns 1 cent -> Z3 refutes conservation of money with a witness!
    const LeakyTransfer = Transition.make({
      state: Ledger,
      input: Schema.Struct({
        amount: Usd.check(Schema.isBetween({ minimum: 2, maximum: 1_000_000 })),
      }),
      when: ({ state, input }) =>
        Expr.all(
          Num.lte(input.amount, state.a),
          Num.lte(Num.add(state.b, input.amount), 1_000_000),
        ),
      apply: ({ state, input }) => [
        Transition.set(state.a, Money.sub(state.a, input.amount)),
        Transition.set(state.b, Money.add(state.b, Money.sub(input.amount, Money.minor('USD', 1)))),
      ],
    })
    const leakyProof = await Effect.runPromise(Prove.transition(Ledger, LeakyTransfer))
    expect(Verdict.isFalse(leakyProof)).toBe(true)

    // Relational goal via Abstract.checkGoal: next.a <= state.a on TransferAtoB
    const goal = Expr.in(
      {
        state: Ledger,
        input: Schema.Struct({
          amount: Usd.check(Schema.isBetween({ minimum: 1, maximum: 1_000_000 })),
        }),
        supplied: Schema.Struct({}),
        next: Ledger,
      },
      ({ state, next }) => Num.lt(next.a, state.a),
    )
    expect(Verdict.isTrue(Abstract.checkGoal(Ledger, TransferAtoB, { goal }))).toBe(true)
  })

  it('proves small-range IEEE-754 float laws and refutes large-float precision loss in Z3', async () => {
    const SmallFloat = Schema.Struct({
      x: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 100 })),
    })
    const $s = Path.from(SmallFloat)
    const smallInc = await Effect.runPromise(
      Prove.invariant(SmallFloat, Num.gt(Num.add($s.x, 1), $s.x)),
    )
    expect(Verdict.isTrue(smallInc)).toBe(true)

    // Over unbounded non-negative Schema.Finite, x + 1 > x is FALSE (at x = 2^53, x + 1 === x!)
    const BigFloat = Schema.Struct({
      x: Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)),
    })
    const $b = Path.from(BigFloat)
    const bigInc = await Effect.runPromise(
      Prove.invariant(BigFloat, Num.gt(Num.add($b.x, 1), $b.x)),
    )
    expect(Verdict.isFalse(bigInc)).toBe(true)
  })

  it('proves integer division & remainder laws in Z3 (positive, negative, zero, and variable divisors)', async () => {
    const DivPair = Schema.Struct({
      a: Schema.Int.check(Schema.isBetween({ minimum: -1000, maximum: 1000 })),
      b: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 20 })),
    })
    const $ = Path.from(DivPair)

    // Fundamental Euclidean identity with positive & negative literal divisors (instant LIA)
    for (const d of [7, -7]) {
      const q = Num.div($.a, d, { rounding: 'toward-zero', onZero: 'refuse' })
      const r = Num.rem($.a, d, { onZero: 'refuse' })
      const identity = Eq.is(Num.add(Num.mul(q, d), r), $.a)
      expect(Verdict.isTrue(await Effect.runPromise(Prove.invariant(DivPair, identity)))).toBe(true)

      // Rounding monotonicity: floor(a / d) <= half-even(a / d) <= ceiling(a / d)
      const fl = Num.div($.a, d, { rounding: 'floor', onZero: 'refuse' })
      const he = Num.div($.a, d, { rounding: 'half-even', onZero: 'refuse' })
      const ce = Num.div($.a, d, { rounding: 'ceiling', onZero: 'refuse' })
      expect(
        Verdict.isTrue(
          await Effect.runPromise(
            Prove.invariant(DivPair, Expr.all(Num.lte(fl, he), Num.lte(he, ce))),
          ),
        ),
      ).toBe(true)
    }

    // Symbolic variable divisor b in [1, 20]: floor(a / b) <= ceiling(a / b)
    const flVar = Num.div($.a, $.b, { rounding: 'floor', onZero: 'refuse' })
    const ceVar = Num.div($.a, $.b, { rounding: 'ceiling', onZero: 'refuse' })
    expect(
      Verdict.isTrue(await Effect.runPromise(Prove.invariant(DivPair, Num.lte(flVar, ceVar)))),
    ).toBe(true)

    // Division by literal 0 with onZero: 'null' always yields null
    expect(
      Verdict.isTrue(
        await Effect.runPromise(
          Prove.invariant(
            DivPair,
            Null.isNull(Num.div($.a, 0, { rounding: 'floor', onZero: 'null' })),
          ),
        ),
      ),
    ).toBe(true)
  })

  it('proves CalendarDay & Time laws in Z3 (addDays/daysBetween inverse and overlaps symmetry)', async () => {
    const Dates = Schema.Struct({
      a: CalendarDay.schema.check(
        Schema.isBetween({ minimum: day('2000-01-01'), maximum: day('2100-01-01') }),
      ),
      b: CalendarDay.schema.check(
        Schema.isBetween({ minimum: day('2000-01-01'), maximum: day('2100-01-01') }),
      ),
      c: CalendarDay.schema.check(
        Schema.isBetween({ minimum: day('2000-01-01'), maximum: day('2100-01-01') }),
      ),
      d: CalendarDay.schema.check(
        Schema.isBetween({ minimum: day('2000-01-01'), maximum: day('2100-01-01') }),
      ),
      k: Schema.Int.check(Schema.isBetween({ minimum: -365, maximum: 365 })),
    })
    const $ = Path.from(Dates)

    // daysBetween(later, earlier) === later - earlier
    const inverse = Eq.is(Time.daysBetween(Time.addDays($.a, $.k), $.a), $.k)
    expect(Verdict.isTrue(await Effect.runPromise(Prove.invariant(Dates, inverse)))).toBe(true)

    const sym = Eq.is(Time.overlaps($.a, $.b, $.c, $.d), Time.overlaps($.c, $.d, $.a, $.b))
    expect(Verdict.isTrue(await Effect.runPromise(Prove.invariant(Dates, sym)))).toBe(true)
  })

  it('proves String length laws in Z3 (concat, lowerAscii, upperAscii, trim)', async () => {
    const Texts = Schema.Struct({
      a: Text.schema.check(Schema.isMaxLength(1000)),
      b: Text.schema.check(Schema.isMaxLength(1000)),
    })
    const $ = Path.from(Texts)

    const concatLen = Eq.is(Str.len(Str.concat($.a, $.b)), Num.add(Str.len($.a), Str.len($.b)))
    expect(Verdict.isTrue(await Effect.runPromise(Prove.invariant(Texts, concatLen)))).toBe(true)

    const lowerLen = Eq.is(Str.len(Str.lowerAscii($.a)), Str.len($.a))
    expect(Verdict.isTrue(await Effect.runPromise(Prove.invariant(Texts, lowerLen)))).toBe(true)

    const upperLen = Eq.is(Str.len(Str.upperAscii($.a)), Str.len($.a))
    expect(Verdict.isTrue(await Effect.runPromise(Prove.invariant(Texts, upperLen)))).toBe(true)

    const trimLen = Num.lte(Str.len(Str.trim($.a)), Str.len($.a))
    expect(Verdict.isTrue(await Effect.runPromise(Prove.invariant(Texts, trimLen)))).toBe(true)
  })

  it('proves separation of duties and catches cross-tenant privilege escalation in Policy Z3 proofs', async () => {
    const Doc = Schema.Struct({
      tenantId: Text.schema,
      authorId: Text.schema,
      status: Schema.Literals(['draft', 'review', 'published']),
    })
    const User = Schema.Struct({
      userId: Text.schema,
      tenantId: Text.schema,
      role: Schema.Literals(['author', 'approver', 'admin']),
    })

    const SafePolicy = Policy.make({
      row: Doc,
      principal: User,
      rules: ({ row, principal }) => ({
        sameTenant: Eq.is(row.tenantId, principal.tenantId),
        notAuthor: Bool.not(Eq.is(row.authorId, principal.userId)),
        canApprove: Expr.all(
          Eq.is(row.tenantId, principal.tenantId),
          Eq.is(row.status, 'review'),
          Eq.is(principal.role, 'approver'),
          Bool.not(Eq.is(row.authorId, principal.userId)),
        ),
        // Buggy rule: accidentally forgets tenant check on drafts!
        buggyEdit: Expr.any(
          Eq.is(row.status, 'draft'),
          Expr.all(Eq.is(row.tenantId, principal.tenantId), Eq.is(principal.role, 'admin')),
        ),
      }),
    })

    // Separation of duties: canApprove => notAuthor
    expect(
      Verdict.isTrue(
        await Effect.runPromise(Prove.policyImplies(SafePolicy, 'canApprove', 'notAuthor')),
      ),
    ).toBe(true)
    // Tenant isolation: canApprove => sameTenant
    expect(
      Verdict.isTrue(
        await Effect.runPromise(Prove.policyImplies(SafePolicy, 'canApprove', 'sameTenant')),
      ),
    ).toBe(true)
    // Cross-tenant escalation: buggyEdit does NOT imply sameTenant -> Z3 produces a counterexample!
    const leak = await Effect.runPromise(Prove.policyImplies(SafePolicy, 'buggyEdit', 'sameTenant'))
    expect(Verdict.isFalse(leak)).toBe(true)
    if (Verdict.isFalse(leak)) {
      expect(Option.isSome(leak.witness)).toBe(true)
    }
  })
})
