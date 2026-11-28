import { Option, Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  Abstract,
  Arr,
  Bool,
  Eq,
  Expr,
  Node,
  Null,
  Num,
  Ord,
  Path,
  Transition,
} from '../src/index.js'
import { Zone } from '../src/abstract/zone.js'
import * as Machine from '../src/machine.js'
import * as Judge from '../src/ops/judge.js'
import * as Kind from '../src/ops/kind.js'
import * as Pairs from '../src/pairs.js'
import * as Temporal from '../src/temporal.js'

describe('Phase 1 & 5 adversarial review regressions', () => {
  it('H2: lists.refusesNothing rejects NaN-capable numbers in eq.equals and numbers in bool.*', () => {
    const State = Schema.Struct({ items: Schema.Array(Schema.Number) })
    const s = Path.from(State)
    const bounded = Ord.lte(
      Arr.count(Arr.keep(s.items, each => Eq.equals(each, 0))),
      Arr.count(s.items),
    )
    // Schema.Number admits NaN, for which eq.equals(NaN, 0) returns Refusal('non-finite').
    expect(Abstract.checkInvariant(State, bounded)._tag).not.toBe('True')

    // bool.not over a number refuses at runtime.
    const NumState = Schema.Struct({ items: Schema.Array(Schema.Int) })
    const ns = Path.from(NumState)
    const badBool = Ord.lte(
      Arr.count(
        Arr.keep(ns.items, each =>
          Bool.not(each as unknown as Expr.Expr<{ readonly each: number }, boolean>),
        ),
      ),
      Arr.count(ns.items),
    )
    expect(Abstract.checkInvariant(NumState, badBool)._tag).not.toBe('True')
  })

  it('H3: MulScaled.unrefused rejects operands outside SAFE even when product is 0', () => {
    const State = Schema.Struct({})
    const rule = Eq.equals(Num.mulScaled(0, 2 ** 53, { shift: 0 }), 0)
    // 2**53 is refused by ops/mulScaled.ts even though 0 * 2**53 = 0.
    expect(Expr.holds(rule, {})).toBe(false)
    expect(Abstract.checkInvariant(State, rule)._tag).not.toBe('True')
  })

  it('M5: Zone addUp does not underflow to -Infinity on -1e308 + -1e308', () => {
    const z = Zone.make(2)
    z.constrainDiff(1, 0, -1e308)
    z.constrainDiff(0, 2, -1e308)
    expect(z.close()).toBe(true)
    expect(Number.isFinite(z.diffBound(1, 2))).toBe(true)
  })

  it('M1: Temporal.registry.report keeps an obligation open if a later walk is Broken', () => {
    const reg = Temporal.makeRegistry()
    const scope = { owner: 'Test', where: 'test:1' }
    reg.declare(scope, [Temporal.obligation({ name: 'op', over: ['s'], shows: 'check' })])
    reg.record(scope, { obligation: 'op', result: Temporal.WalkResult.Held({ seed: 1, runs: 5 }) })
    reg.record(scope, {
      obligation: 'op',
      result: Temporal.WalkResult.Broken({
        seed: 2,
        interleaving: ['a'],
        minimal: ['a'],
        reason: 'failed',
      }),
    })
    const report = reg.report()
    expect(report.ok).toBe(false)
    expect(report.discharged).toHaveLength(0)
    expect(report.open).toHaveLength(1)
  })

  it('M2: walk and walkPair reject runs <= 0, and registry.decide does not overwrite a refuted decision', () => {
    expect(() =>
      Temporal.walk(
        {
          initial: () => 0,
          steps: [{ name: 'a', run: n => n + 1 }],
          holds: () => Option.none(),
        },
        { runs: 0 },
      ),
    ).toThrow(/positive integer/)

    const State = Schema.Struct({ n: Schema.Int })
    const Inc = Transition.make({
      state: State,
      input: Schema.Struct({}),
      apply: ({ state }) => [Transition.add(state.n, 1)],
    })
    const M = Machine.make({
      state: State,
      transitions: { Inc },
    })
    expect(() => Pairs.walkPair(M, ['Inc', 'Inc'], { runs: 0 })).toThrow(/positive integer/)

    const reg = Temporal.makeRegistry()
    const scope = { owner: 'M', where: 'test:2' }
    reg.decide(scope, {
      name: 'a / b',
      reason: 'claimed',
      checked: Temporal.WalkResult.Broken({
        seed: 1,
        interleaving: ['a', 'b'],
        minimal: ['a', 'b'],
        reason: 'differed',
      }),
    })
    reg.decide(scope, {
      name: 'a / b',
      reason: 'claimed',
      checked: Temporal.WalkResult.Held({ seed: 2, runs: 10 }),
    })
    const report = reg.report()
    expect(report.ok).toBe(false)
    expect(report.refuted).toHaveLength(1)
  })

  it('L1: eq.in / eq.among with a non-array second arg is not marked cannotRefuse', () => {
    const badIn = Node.Call({
      op: Eq.inOp,
      args: [Node.Lit({ value: 1 }), Node.Lit({ value: 42 })],
    })
    expect(Kind.cannotRefuse(badIn)).toBe(false)

    const goodIn = Node.Call({
      op: Eq.inOp,
      args: [Node.Lit({ value: 1 }), Node.Lit({ value: [1, 2] })],
    })
    expect(Kind.cannotRefuse(goodIn)).toBe(true)
  })

  it('L2: Judge normalizes undefined on Lit and Opaque to null', () => {
    const litIsNull = Node.Call({ op: Null.isNullOp, args: [Node.Lit({ value: undefined })] })
    expect(Judge.judgeNode(litIsNull, {}, {})._tag).toBe('True')

    const opaqueIsNull = Node.Call({
      op: Null.isNullOp,
      args: [Node.Opaque({ name: 'undef', reads: Option.some([]), run: () => undefined })],
    })
    expect(Judge.judgeNode(opaqueIsNull, {}, {})._tag).toBe('True')
  })

  it('H4: include and exclude commute even on unsorted arrays', () => {
    const State = Schema.Struct({ tags: Schema.Array(Schema.String) })
    const AddB = Transition.make({
      state: State,
      input: Schema.Struct({}),
      apply: ({ state }) => [Transition.include(state.tags, 'b')],
    })
    const DropC = Transition.make({
      state: State,
      input: Schema.Struct({}),
      apply: ({ state }) => [Transition.exclude(state.tags, 'c')],
    })
    expect(Transition.commutes(AddB, DropC)._tag).toBe('True')
    const start = { tags: ['c', 'a'] }
    const ab = Result.getOrThrow(
      Transition.run(DropC, Result.getOrThrow(Transition.run(AddB, start, {})), {}),
    )
    const ba = Result.getOrThrow(
      Transition.run(AddB, Result.getOrThrow(Transition.run(DropC, start, {})), {}),
    )
    expect(ab).toEqual({ tags: ['a', 'b'] })
    expect(ba).toEqual({ tags: ['a', 'b'] })
  })

  it('L4: Transition.commutes does not treat +0 and -0 as the same literal', () => {
    const State = Schema.Struct({ n: Schema.Number })
    const Pos = Transition.make({
      state: State,
      input: Schema.Struct({}),
      apply: ({ state }) => [Transition.set(state.n, 0)],
    })
    const Neg = Transition.make({
      state: State,
      input: Schema.Struct({}),
      apply: ({ state }) => [Transition.set(state.n, -0)],
    })
    expect(Transition.commutes(Pos, Neg)._tag).not.toBe('True')
  })

  it('H2 (deep review 2): Transition.idempotent rejects patchWhere writing a field read by a fallible test', () => {
    const State = Schema.Struct({
      list: Schema.Array(Schema.Struct({ id: Schema.String, n: Schema.Int })),
    })
    const Risky = Transition.make({
      state: State,
      input: Schema.Struct({}),
      apply: ({ state }) => [
        Transition.patchWhere(
          state.list,
          each => Ord.gt(Num.add(each.n, 1), 0),
          () => ({ n: Number.MAX_SAFE_INTEGER }),
        ),
      ],
    })
    expect(Transition.idempotent(Risky)._tag).not.toBe('True')
    const r1 = Transition.run(Risky, { list: [{ id: '1', n: 5 }] }, {})
    expect(Result.isSuccess(r1)).toBe(true)
    if (Result.isSuccess(r1)) {
      expect(Result.isFailure(Transition.run(Risky, r1.success, {}))).toBe(true)
    }
  })

  it('H3 (deep review 2): Transition.insert refuses a NUL key on an empty list, keeping idempotence sound', () => {
    const State = Schema.Struct({
      list: Schema.Array(Schema.Struct({ id: Schema.String, title: Schema.String })),
    })
    const Add = Transition.make({
      state: State,
      input: Schema.Struct({ id: Schema.String }),
      apply: ({ state, input }) => [Transition.insert(state.list, { id: input.id, title: 'x' })],
    })
    expect(Transition.idempotent(Add)._tag).toBe('True')
    // Both run 1 (empty list) and run 2 must agree on NUL keys (both refused).
    expect(Result.isFailure(Transition.run(Add, { list: [] }, { id: '\0' }))).toBe(true)
  })

  it('M4 (deep review 2): Temporal.walkAsync rejects duplicate step names and unknown after references', async () => {
    await expect(
      Temporal.walkAsync({
        initial: async () => 0,
        steps: [
          { name: 'a', run: async () => {} },
          { name: 'a', run: async () => {} },
        ],
        holds: async () => Option.none(),
      }),
    ).rejects.toThrow(/two steps are named "a"/)

    await expect(
      Temporal.walkAsync({
        initial: async () => 0,
        steps: [{ name: 'a', after: ['missing' as 'a'], run: async () => {} }],
        holds: async () => Option.none(),
      }),
    ).rejects.toThrow(/which is no step/)
  })
})
