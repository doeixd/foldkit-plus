import { Effect, Option, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import * as Eq from '../src/ops/eq.js'
import * as Expr from '../src/expr.js'
import * as Machine from '../src/machine.js'
import * as Num from '../src/ops/num.js'
import * as Path from '../src/path.js'
import * as Prove from '../src/prove.js'
import * as Tooling from '../src/tooling.js'
import * as Transition from '../src/transition.js'
import * as Verdict from '../src/verdict.js'

const Balance = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1000 }))
const Amount = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 }))
const Child = Schema.Struct({ id: Schema.String, balance: Balance })
const Outer = Schema.Struct({ child: Child, other: Schema.Int })
const OuterList = Schema.Struct({ items: Schema.Array(Child) })

const Deposit = Transition.make({
  state: Child,
  input: Schema.Struct({ amount: Amount }),
  when: ({ state, input }) => Num.lte(Num.add(state.balance, input.amount), 1000),
  apply: ({ state, input }) => [
    Transition.set(state.balance, Num.add(state.balance, input.amount)),
  ],
  ensures: ({ state, input, next }) => Eq.is(next.balance, Num.add(state.balance, input.amount)),
})

const DepositWithFalseEnsures = Transition.make({
  state: Child,
  input: Schema.Struct({ amount: Amount }),
  when: ({ state, input }) => Num.lte(Num.add(state.balance, input.amount), 1000),
  apply: ({ state, input }) => [
    Transition.set(state.balance, Num.add(state.balance, input.amount)),
  ],
  ensures: ({ state, next }) => Num.lt(next.balance, state.balance),
})

const DepositNoEnsures = Transition.make({
  state: Child,
  input: Schema.Struct({ amount: Amount }),
  when: ({ state, input }) => Num.lte(Num.add(state.balance, input.amount), 1000),
  apply: ({ state, input }) => [
    Transition.set(state.balance, Num.add(state.balance, input.amount)),
  ],
})

describe('K15: Transition.lift carries ensures and Transition.ensures is always an Option', () => {
  it('sets ensures to Option.none() on every constructor when omitted', () => {
    expect(DepositNoEnsures.ensures).toEqual(Option.none())

    const liftedNoEnsures = Transition.lift(Path.from(Outer).child, DepositNoEnsures)
    expect(liftedNoEnsures.ensures).toEqual(Option.none())

    const opaqueTr = Transition.opaque({
      name: 'bump',
      state: Child,
      input: Schema.Struct({}),
      reads: ({ state }) => [state.balance],
      writes: ({ state }) => [state.balance],
      run: state => ({ ...state, balance: state.balance }),
    })
    expect(opaqueTr.ensures).toEqual(Option.none())

    const childMachine = Machine.make({ state: Child, transitions: { DepositNoEnsures } })
    const eachLifted = Machine.each(Path.from(OuterList).items, 'id', childMachine)
    expect(eachLifted.transitions.DepositNoEnsures.ensures).toEqual(Option.none())
  })

  it('carries and rewrites ensures (both state and next) across Transition.lift', () => {
    const lifted = Transition.lift(Path.from(Outer).child, Deposit)
    expect(Option.isSome(lifted.ensures)).toBe(true)
    if (Option.isNone(lifted.ensures)) return

    const ensures = lifted.ensures.value
    const before = { child: { id: 'c1', balance: 10 }, other: 0 }
    const input = { amount: 5 }
    const goodAfter = { child: { id: 'c1', balance: 15 }, other: 0 }
    const badAfter = { child: { id: 'c1', balance: 12 }, other: 0 }

    expect(Expr.eval(ensures, { state: before, input, supplied: {}, next: goodAfter })).toBe(true)
    expect(Expr.eval(ensures, { state: before, input, supplied: {}, next: badAfter })).toBe(false)
  })

  it('Prove.transition proves valid lifted ensures and refutes violated lifted ensures', async () => {
    const liftedValid = Transition.lift(Path.from(Outer).child, Deposit)
    const validProof = await Effect.runPromise(Prove.transition(Outer, liftedValid))
    expect(Verdict.isTrue(validProof)).toBe(true)

    const liftedBad = Transition.lift(Path.from(Outer).child, DepositWithFalseEnsures)
    const badProof = await Effect.runPromise(Prove.transition(Outer, liftedBad))
    expect(Verdict.isFalse(badProof)).toBe(true)
  })

  it('SemanticIndex includes lifted ensures in transition fingerprint and reads', async () => {
    const liftedA = Transition.lift(Path.from(Outer).child, Deposit)
    const liftedB = Transition.lift(Path.from(Outer).child, DepositNoEnsures)

    const index = await Effect.runPromise(
      Tooling.makeIndex([
        Tooling.Definition.transition('Outer.depositWithEnsures', liftedA),
        Tooling.Definition.transition('Outer.depositNoEnsures', liftedB),
      ]),
    )
    const infoA = await Effect.runPromise(index.definition('Outer.depositWithEnsures'))
    const infoB = await Effect.runPromise(index.definition('Outer.depositNoEnsures'))

    expect(Option.isSome(infoA.fingerprint)).toBe(true)
    expect(Option.isSome(infoB.fingerprint)).toBe(true)
    expect(infoA.fingerprint).not.toEqual(infoB.fingerprint)
    expect(infoA.reads).toContain('next.child.balance')
  })
})
