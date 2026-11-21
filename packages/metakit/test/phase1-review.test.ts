/**
 * Adversarial regression tests for the Phase 1 soundness & correctness review:
 * every counterexample that previously caused Z3, the abstract checker, or the
 * evaluator to disagree.
 */
import { Effect, Option, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import * as Abstract from '../src/abstract/check.js'
import * as Expr from '../src/expr.js'
import * as Node from '../src/node.js'
import * as Eq from '../src/ops/eq.js'
import * as Null from '../src/ops/null.js'
import * as Ord from '../src/ops/ord.js'
import { judgeNode } from '../src/ops/residualize.js'
import * as Path from '../src/path.js'
import * as Prove from '../src/prove.js'
import * as Transition from '../src/transition.js'
import * as Verdict from '../src/verdict.js'

describe('Phase 1 adversarial soundness regressions', () => {
  it('Node.holdsNul recurses into array literals so Eq.in with NUL candidates is not proved True', async () => {
    const State = Schema.Struct({ x: Schema.Literal('a') })
    const s = Path.forSchema(State)
    const goal = Eq.in(s.x, ['a', 'b\u0000c'])
    expect(() => Expr.evaluate(goal, { x: 'a' })).toThrow(/NUL/)
    expect(Verdict.isTrue(Abstract.checkInvariant(State, goal))).toBe(false)
    const proved = await Effect.runPromise(Prove.invariant(State, goal))
    expect(Verdict.isTrue(proved)).toBe(false)
  })

  it('Z3 nulOf does not constrain untaken Null.coalesce / If branches in hypotheses', async () => {
    const State = Schema.Struct({ a: Schema.Literal('ok'), b: Schema.String }).pipe(
      Expr.refine($ => Eq.is(Null.coalesce($.a, $.b), 'ok')),
    )
    const s = Path.forSchema(State)
    const goal = Eq.is(s.b, s.b)
    // Counterexample: { a: 'ok', b: 'x\u0000y' } satisfies State and goal refuses
    expect(() => Expr.evaluate(goal, { a: 'ok', b: 'x\u0000y' })).toThrow(/NUL/)
    const proved = await Effect.runPromise(Prove.invariant(State, goal))
    expect(Verdict.isTrue(proved)).toBe(false)
  })

  it('Prove.transition does not prove non-nullable preservation for Null.coalesce of two nullables', async () => {
    const State = Schema.Struct({ x: Schema.Int })
    const Input = Schema.Struct({
      a: Schema.NullOr(Schema.Int),
      b: Schema.NullOr(Schema.Int),
    })
    const tr = Transition.make({
      state: State,
      input: Input,
      apply: ({ state, input }) => [
        Transition.set(
          state.x,
          Null.coalesce(input.a, input.b) as unknown as Expr.Expr<any, number>,
        ),
      ],
    })
    const proved = await Effect.runPromise(Prove.transition(State, tr))
    expect(Verdict.isTrue(proved)).toBe(false)
  })

  it('Abstract.checkGoal does not mark multi-arg strict op operands portable when another operand may be null', () => {
    const State = Schema.Struct({
      s: Schema.NullOr(Schema.String),
      p: Schema.String,
      flag: Schema.NullOr(Schema.Boolean),
    })
    const tr = Transition.make({
      state: State,
      input: Schema.Struct({}),
      apply: ({ state }) => [Transition.set(state.flag, Eq.equals(state.s, state.p))],
    })
    const next = Path.forEnv({ next: State }).next
    const goal = Eq.is(next.p, next.p)
    const checked = Abstract.checkGoal(State, tr, { goal })
    expect(Verdict.isTrue(checked)).toBe(false)
  })

  it('ops/eq normalizes lone surrogates to U+FFFD consistently with ops/str and SQL UTF-8', () => {
    const State = Schema.Struct({ a: Schema.String, b: Schema.String })
    const s = Path.forSchema(State)
    const same = Eq.is(s.a, s.b)
    expect(Expr.evaluate(same, { a: '\uD83D', b: '\uFFFD' })).toBe(true)
    expect(Expr.evaluate(Eq.in(s.a, ['\uFFFD']), { a: '\uD83D', b: '' })).toBe(true)
  })

  it('Abstract.checkInvariant does not treat Eq.is(x, NaN) as proving Ord.lte(x, x)', () => {
    const State = Schema.Struct({ x: Schema.Number }).pipe(Expr.refine($ => Eq.is($.x, Number.NaN)))
    const s = Path.forSchema(State)
    const goal = Ord.lte(s.x, s.x)
    expect(() => Expr.evaluate(goal, { x: Number.NaN })).toThrow(/NaN/)
    expect(Verdict.isTrue(Abstract.checkInvariant(State, goal))).toBe(false)
  })

  it('null.coalesce with a refused literal or nullable non-finite number is not falsely valued/fitted', () => {
    const State = Schema.Struct({
      x: Schema.NullOr(Schema.Number),
      y: Schema.NullOr(Schema.Finite),
    })
    const tr = Transition.make({
      state: State,
      input: Schema.Struct({}),
      apply: ({ state }) => [Transition.set(state.y, Null.coalesce(state.x, 0))],
    })
    // { x: NaN, y: null } produces NaN, which violates Schema.NullOr(Schema.Finite)
    expect(Verdict.isTrue(Abstract.checkTransition(State, tr))).toBe(false)
  })

  it('judgeNode reports unsupported (not missing-env) for a version-mismatched foreign op with unknown args', () => {
    const op: Node.ForeignOp = {
      _tag: 'Foreign',
      id: 'custom.check',
      version: 2,
      returns: 'boolean',
      nulls: 'strict',
    }
    const call = Node.Call({
      op,
      args: [Node.Path({ segments: ['x'], ast: Schema.String.ast })],
    })
    const verdict = judgeNode(call, {}, { 'custom.check': { version: 1, evaluate: () => true } })
    expect(Verdict.isUnknown(verdict)).toBe(true)
    if (Verdict.isUnknown(verdict)) {
      expect(Option.map(verdict.obligation, o => o.kind)).toEqual(Option.some('unsupported'))
    }
  })
})
