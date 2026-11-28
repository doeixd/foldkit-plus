/**
 * The checker refutes (False) only with every assumption read in full. The
 * independent review of W1 found four ways it still refuted past one it read
 * in part, or misread: each case below admits no value, or allows a concrete
 * one, where the checker said otherwise.
 */
import { Option, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Abstract, Eq, Expr, Null, Transition, Verdict } from '@doeixd/metakit'
import * as Policy from '@doeixd/metakit/policy'

const Int = Schema.Struct({ x: Schema.Int })

describe('the checker does not refute past an assumption it reads in part', () => {
  it('a membership keeps only the range of its candidates: x among [0, 2] beside x is 1 admits no value', () => {
    const Hole = Int.pipe(
      Expr.refine($ => Eq.among($.x, [0, 2])),
      Expr.refine($ => Eq.is($.x, 1)),
    )
    expect(Schema.is(Hole)({ x: 1 })).toBe(false)
    expect(Verdict.isFalse(Abstract.checkInvariant(Hole, Expr.lit(false)))).toBe(false)
  })

  it('a term is never unequal to itself: x isNot x admits no value, so anything holds', () => {
    const Never = Int.pipe(Expr.refine($ => Eq.isNot($.x, $.x)))
    expect(Verdict.isTrue(Abstract.checkInvariant(Never, Expr.lit(false)))).toBe(true)
  })

  it('a struct literal written twice is one value, so the rule is not dead', () => {
    const Row = Schema.Struct({ child: Schema.Struct({ x: Schema.Int }) })
    const policy = Policy.make({
      row: Row,
      principal: Schema.Struct({}),
      rules: ({ row }) => ({
        allow: Expr.all(Eq.is(row.child, { x: 1 }), Eq.is(row.child, { x: 1 })),
      }),
    })
    expect(policy.allow('allow', { row: { child: { x: 1 } }, principal: {} })).toBe(true)
    expect(Verdict.isFalse(Policy.checkConsistent(policy, 'allow'))).toBe(false)
  })

  it('a step whose write lies under a null field is refused, so it cannot leave a bad state', () => {
    const State = Schema.Struct({
      profile: Schema.NullOr(
        Schema.Struct({ age: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)) }),
      ),
    }).pipe(Expr.refine($ => Null.isNull($.profile)))
    const Age = Transition.make({
      state: State,
      input: Schema.Struct({}),
      apply: ({ state }) => [Transition.set(state.profile.age, -1)],
    })
    expect(Transition.step(Age, { profile: null }, {})._tag).toBe('Failure')
    expect(Abstract.checkTransition(State, Age)).toEqual(
      Verdict.True(Option.some(Verdict.Proved('zone'))),
    )
    expect(Verdict.isTrue(Abstract.checkGoal(State, Age, { goal: Expr.lit(false) }))).toBe(true)
  })
})
