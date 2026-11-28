import { Expr, Num, Ord, Path, Transition, Verdict } from '@doeixd/metakit'
import * as Interpreter from '@doeixd/metakit/interpreter'
import * as Machine from '@doeixd/metakit/machine'
import * as Operation from '@doeixd/metakit/operation'
import { Effect, Layer, Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'

const Item = Schema.Struct({
  id: Schema.String,
  meta: Schema.Struct({ count: Schema.Int }),
})
type Item = typeof Item.Type

const Box = Schema.Struct({
  items: Schema.Array(Item),
})
type Box = typeof Box.Type

const FlatItem = Schema.Struct({
  id: Schema.String,
  count: Schema.Int,
})
const FlatBox = Schema.Struct({
  items: Schema.Array(FlatItem),
})

const Wrapper = Schema.Struct({
  box: Box,
})

const isEligible = Operation.define({
  id: 'test.t4.eligible',
  version: 1,
  args: [Schema.Int],
  returns: Schema.Boolean,
  nulls: 'strict',
})

const bump = Operation.define({
  id: 'test.t4.bump',
  version: 1,
  args: [Schema.Int, Schema.Int],
  returns: Schema.Int,
  nulls: 'strict',
})

const label = Operation.define({
  id: 'test.t4.label',
  version: 1,
  args: [Schema.Int],
  returns: Schema.String,
  nulls: 'strict',
})

const eligibleImpl = Operation.implement(isEligible, count => count >= 1)
const bumpImpl = Operation.implement(bump, (count, delta) => count + delta)
const labelImpl = Operation.implement(label, count => `n:${count}`)
const foreign = Operation.implementations('t4', eligibleImpl, bumpImpl, labelImpl)

const ChildMachine = Machine.make({
  state: Item,
  transitions: {
    Advance: Transition.make({
      state: Item,
      input: Schema.Struct({ delta: Schema.Int }),
      when: ({ state }) => isEligible(state.meta.count),
      apply: ({ state, input }) => [
        Transition.set(state.meta.count, bump(state.meta.count, input.delta)),
      ],
      emits: ({ state }) => [Transition.emit('Advanced', { tag: label(state.meta.count) })],
    }),
    // Child whose guard itself refuses on safe-integer overflow (no foreign ops).
    CheckedAdd: Transition.make({
      state: Item,
      input: Schema.Struct({ delta: Schema.Int }),
      when: ({ state, input }) => Ord.gt(Num.add(state.meta.count, input.delta), 0),
      apply: ({ state, input }) => [
        Transition.set(state.meta.count, Num.add(state.meta.count, input.delta)),
      ],
    }),
    // Child whose guard depends only on input (so judge/residualize evaluate the opaque).
    InputGated: Transition.make({
      state: Item,
      input: Schema.Struct({ threshold: Schema.Int }),
      when: ({ input }) => isEligible(input.threshold),
      apply: ({ state, input }) => [Transition.set(state.meta.count, input.threshold)],
    }),
  },
})

const ParentMachine = Machine.compose({
  state: Box,
  transitions: {},
  children: {
    '': Machine.each(Path.from(Box).items, 'id', ChildMachine),
  },
})

const FlatChildMachine = Machine.make({
  state: FlatItem,
  transitions: {
    Bump: Transition.make({
      state: FlatItem,
      input: Schema.Struct({ delta: Schema.Int }),
      when: ({ state }) => isEligible(state.count),
      apply: ({ state, input }) => [Transition.set(state.count, bump(state.count, input.delta))],
      emits: ({ state }) => [Transition.emit('Bumped', { tag: label(state.count) })],
    }),
  },
})

const FlatParentMachine = Machine.compose({
  state: FlatBox,
  transitions: {},
  children: {
    '': Machine.each(Path.from(FlatBox).items, 'id', FlatChildMachine),
  },
})

const LiftedParent = Machine.compose({
  state: Wrapper,
  transitions: {},
  children: {
    '': Machine.lift(Path.from(Wrapper).box, ParentMachine),
  },
})

const guardRefusalOf = (why: Transition.Why) =>
  Transition.Why.$match(why, {
    Input: () => undefined,
    Supplied: () => undefined,
    UnknownMessage: () => undefined,
    Guard: () => undefined,
    GuardRefused: ({ refusal }) => refusal,
    Evaluation: () => undefined,
    Unwritable: () => undefined,
  })

const evalRefusalOf = (why: Transition.Why) =>
  Transition.Why.$match(why, {
    Input: () => undefined,
    Supplied: () => undefined,
    UnknownMessage: () => undefined,
    Guard: () => undefined,
    GuardRefused: () => undefined,
    Evaluation: ({ refusal }) => refusal,
    Unwritable: () => undefined,
  })

const startState: Box = {
  items: [
    { id: 'a', meta: { count: 2 } },
    { id: 'b', meta: { count: 0 } },
  ],
}

describe('Machine.each foreign implementations and refused child guards (T4, #663)', () => {
  it('steps and emits a nested-path child whose guard, write, and emit use foreign ops', () => {
    const res = ParentMachine.dispatch(
      startState,
      { _tag: 'Advance', input: { id: 'a', delta: 3 } },
      { foreign },
    )
    expect(Result.isSuccess(res)).toBe(true)
    if (Result.isSuccess(res)) {
      expect(res.success.state).toEqual({
        items: [
          { id: 'a', meta: { count: 5 } },
          { id: 'b', meta: { count: 0 } },
        ],
      })
      expect(res.success.emitted).toEqual([{ _tag: 'Advanced', tag: 'n:2' }])
    }

    const viaStep = Transition.step(
      ParentMachine.transitions.Advance,
      startState,
      { id: 'a', delta: 3 },
      undefined,
      { foreign },
    )
    expect(Result.isSuccess(viaStep)).toBe(true)
    if (Result.isSuccess(viaStep)) {
      expect(viaStep.success.state.items[0]?.meta.count).toBe(5)
      expect(viaStep.success.emitted).toEqual([{ _tag: 'Advanced', tag: 'n:2' }])
    }
  })

  it('runs a flat child emit with the caller foreign implementations', () => {
    const res = FlatParentMachine.dispatch(
      { items: [{ id: 'a', count: 2 }] },
      { _tag: 'Bump', input: { id: 'a', delta: 4 } },
      { foreign },
    )
    expect(Result.isSuccess(res)).toBe(true)
    if (Result.isSuccess(res)) {
      expect(res.success.state).toEqual({ items: [{ id: 'a', count: 6 }] })
      expect(res.success.emitted).toEqual([{ _tag: 'Bumped', tag: 'n:2' }])
    }
  })

  it('refuses unsupported (not silent no-match) when dispatched without foreign implementations', () => {
    const res = ParentMachine.dispatch(startState, {
      _tag: 'Advance',
      input: { id: 'a', delta: 3 },
    })
    expect(Result.isFailure(res)).toBe(true)
    if (Result.isFailure(res)) {
      const refusal = guardRefusalOf(res.failure.why)
      expect(refusal).toBeDefined()
      expect(refusal?.reason).toBe('unsupported')
      expect(refusal?.at).toBe('test.t4.eligible')
    }
  })

  it('propagates a child guard refusal instead of treating it as no match', () => {
    const overflowing: Box = {
      items: [{ id: 'a', meta: { count: Number.MAX_SAFE_INTEGER } }],
    }
    const res = ParentMachine.dispatch(overflowing, {
      _tag: 'CheckedAdd',
      input: { id: 'a', delta: 1 },
    })
    expect(Result.isFailure(res)).toBe(true)
    if (Result.isFailure(res)) {
      const refusal = guardRefusalOf(res.failure.why)
      expect(refusal).toBeDefined()
      expect(refusal?.reason).toBe('unsafe-integer')
    }

    // Duplicate keys: first passes `when`, second refuses during the write loop.
    const dupes: Box = {
      items: [
        { id: 'a', meta: { count: 1 } },
        { id: 'a', meta: { count: Number.MAX_SAFE_INTEGER } },
      ],
    }
    const dupRes = ParentMachine.dispatch(dupes, {
      _tag: 'CheckedAdd',
      input: { id: 'a', delta: 1 },
    })
    expect(Result.isFailure(dupRes)).toBe(true)
    if (Result.isFailure(dupRes)) {
      const refusal = evalRefusalOf(dupRes.failure.why)
      expect(refusal).toBeDefined()
      expect(refusal?.reason).toBe('unsafe-integer')
    }
  })

  it('enforces Interpreter.withAllowlist on Machine.each child operations', async () => {
    const full = Interpreter.layer({ foreign })
    const allowed = await Effect.runPromise(
      Interpreter.step(ParentMachine.transitions.Advance, startState, { id: 'a', delta: 3 }).pipe(
        Effect.provide(full),
      ),
    )
    expect(allowed.state.items[0]?.meta.count).toBe(5)
    expect(allowed.emitted).toEqual([{ _tag: 'Advanced', tag: 'n:2' }])

    // Exclude the guard op: refused as unsupported.
    const noGuard = Interpreter.withAllowlist(new Set([bumpImpl.key, labelImpl.key])).pipe(
      Layer.provide(full),
    )
    const guardFail = await Effect.runPromise(
      Effect.result(
        Interpreter.step(ParentMachine.transitions.Advance, startState, { id: 'a', delta: 3 }).pipe(
          Effect.provide(noGuard),
        ),
      ),
    )
    expect(Result.isFailure(guardFail)).toBe(true)
    if (Result.isFailure(guardFail)) {
      const refusal = guardRefusalOf(guardFail.failure.why)
      expect(refusal?.reason).toBe('unsupported')
      expect(refusal?.at).toBe('test.t4.eligible')
    }

    // Exclude the emit op: refused as unsupported.
    const noEmit = Interpreter.withAllowlist(new Set([eligibleImpl.key, bumpImpl.key])).pipe(
      Layer.provide(full),
    )
    const emitFail = await Effect.runPromise(
      Effect.result(
        Interpreter.step(ParentMachine.transitions.Advance, startState, { id: 'a', delta: 3 }).pipe(
          Effect.provide(noEmit),
        ),
      ),
    )
    expect(Result.isFailure(emitFail)).toBe(true)
    if (Result.isFailure(emitFail)) {
      const refusal = evalRefusalOf(emitFail.failure.why)
      expect(refusal?.reason).toBe('unsupported')
      expect(refusal?.at).toBe('test.t4.label')
    }

    // Exclude the write op: refused as unsupported.
    const noWrite = Interpreter.withAllowlist(new Set([eligibleImpl.key, labelImpl.key])).pipe(
      Layer.provide(full),
    )
    const writeFail = await Effect.runPromise(
      Effect.result(
        Interpreter.step(ParentMachine.transitions.Advance, startState, { id: 'a', delta: 3 }).pipe(
          Effect.provide(noWrite),
        ),
      ),
    )
    expect(Result.isFailure(writeFail)).toBe(true)
    if (Result.isFailure(writeFail)) {
      const refusal = evalRefusalOf(writeFail.failure.why)
      expect(refusal?.reason).toBe('unsupported')
      expect(refusal?.at).toBe('test.t4.bump')
    }
  })

  it('threads foreign implementations through judge, residualize, prepare, and Machine.lift', async () => {
    const partial = { state: startState, input: { id: 'a', threshold: 2 } }
    const judged = Machine.canDispatch(ParentMachine, 'InputGated', partial, { foreign })
    expect(Verdict.isTrue(judged)).toBe(true)

    const residual = Expr.residualize(
      ParentMachine.transitions.InputGated.when,
      { state: startState, input: { id: 'a', threshold: 2 }, supplied: {} },
      { foreign },
    )
    expect(
      Expr.evaluate(residual, {
        state: startState,
        input: { id: 'a', threshold: 2 },
        supplied: {},
      }),
    ).toBe(true)

    const prepared = await Effect.runPromise(
      Interpreter.prepare(ParentMachine.transitions.Advance.when).pipe(
        Effect.provide(Interpreter.layer({ foreign })),
      ),
    )
    const prepOut = await Effect.runPromise(
      prepared.evaluate({ state: startState, input: { id: 'a', delta: 3 }, supplied: {} }),
    )
    expect(prepOut).toBe(true)

    const lifted = LiftedParent.dispatch(
      { box: startState },
      { _tag: 'Advance', input: { id: 'a', delta: 3 } },
      { foreign },
    )
    expect(Result.isSuccess(lifted)).toBe(true)
    if (Result.isSuccess(lifted)) {
      expect(lifted.success.state.box.items[0]?.meta.count).toBe(5)
      expect(lifted.success.emitted).toEqual([{ _tag: 'Advanced', tag: 'n:2' }])
    }
  })
})
