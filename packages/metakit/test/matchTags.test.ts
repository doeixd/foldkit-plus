import { Effect, Option, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Expr, Num, Ord, Transition, Verdict } from '../src/index.js'
import * as Artifact from '../src/artifact.js'
import * as Fn from '../src/fn.js'
import * as Interpreter from '../src/interpreter.js'

const Message = Schema.Union([
  Schema.TaggedStruct('Increment', {}),
  Schema.TaggedStruct('Decrement', {}),
  Schema.TaggedStruct('SetCount', { count: Schema.Int }),
  Schema.TaggedStruct('Add', { delta: Schema.Int }),
])

const Counter = Schema.Struct({
  count: Schema.Int,
})

describe('Expr.matchTags & Expr.matchTagsExhaustive (#648 #5)', () => {
  it('matches tagged unions with narrowed payload paths across eval, prepare, residualize, judge, reads, Artifact, Fn, and Transition', async () => {
    const nextCount = Fn.make({ state: Counter, msg: Message }, ({ state, msg }) =>
      Expr.matchTagsExhaustive(msg, {
        Increment: () => Num.add(state.count, 1),
        Decrement: () => Num.sub(state.count, 1),
        SetCount: ({ count }) => count,
        Add: ({ delta }) => Num.add(state.count, delta),
      }),
    )

    const samples = [
      { state: { count: 10 }, msg: { _tag: 'Increment' as const }, expected: 11 },
      { state: { count: 10 }, msg: { _tag: 'Decrement' as const }, expected: 9 },
      { state: { count: 10 }, msg: { _tag: 'SetCount' as const, count: 42 }, expected: 42 },
      { state: { count: 10 }, msg: { _tag: 'Add' as const, delta: -3 }, expected: 7 },
    ]

    // 1. Direct evaluation & Interpreter.prepare parity
    const plan = await Effect.runPromise(Interpreter.prepare(nextCount.body))
    expect(plan.strategy).toBe('compiled')
    expect(plan.portable).toBe(true)

    for (const s of samples) {
      expect(nextCount.run({ state: s.state, msg: s.msg })).toBe(s.expected)
      expect(plan.evaluateSync({ state: s.state, msg: s.msg })).toBe(s.expected)
    }

    // 2. Partial evaluation & Kleene K3 judgement
    const isPositiveAfter = Expr.in({ state: Counter, msg: Message }, ({ state, msg }) =>
      Ord.gt(nextCount({ state, msg }), 0),
    )
    expect(
      Verdict.isTrue(
        Expr.judge(isPositiveAfter, {
          state: { count: 10 },
          msg: { _tag: 'Increment' },
        }),
      ),
    ).toBe(true)
    expect(Verdict.isUnknown(Expr.judge(isPositiveAfter, { state: { count: 10 } }))).toBe(true)

    // 3. Static read footprint includes msg._tag and payload fields
    const reads = Expr.reads(nextCount.body)
    expect(Option.isSome(reads)).toBe(true)
    if (Option.isSome(reads)) {
      const flat = reads.value.map(p => p.join('.'))
      expect(flat).toContain('msg._tag')
      expect(flat).toContain('msg.count')
      expect(flat).toContain('msg.delta')
    }

    // 4. Portable artifact round-trip through JSON wire format
    const encoded = await Effect.runPromise(Artifact.encodeExpr(nextCount.body))
    const decoded = await Effect.runPromise(
      Artifact.decodeExpr(JSON.parse(JSON.stringify(encoded)), {
        env: { state: Counter, msg: Message },
        result: Schema.Int,
      }),
    )
    for (const s of samples) {
      expect(Expr.evaluate(decoded, { state: s.state, msg: s.msg })).toBe(s.expected)
    }

    // 5. Guarded TEA Transition using matchTagsExhaustive
    const Update = Transition.make({
      state: Counter,
      input: Schema.Struct({ msg: Message }),
      apply: ({ state, input }) => [
        Transition.set(state.count, nextCount({ state, msg: input.msg })),
      ],
    })
    expect(Update.writes).toHaveLength(1)
  })

  it('supports partial matchTags with fallback including nullable tagged unions', () => {
    const MaybeMsg = Schema.NullOr(Message)
    const extractDelta = Expr.in({ msg: MaybeMsg }, ({ msg }) =>
      Expr.matchTags(
        msg,
        {
          Increment: () => 1,
          Add: ({ delta }) => delta,
        },
        0,
      ),
    )

    expect(Expr.evaluate(extractDelta, { msg: { _tag: 'Increment' } })).toBe(1)
    expect(Expr.evaluate(extractDelta, { msg: { _tag: 'Add', delta: 5 } })).toBe(5)
    expect(Expr.evaluate(extractDelta, { msg: { _tag: 'Decrement' } })).toBe(0)
    expect(Expr.evaluate(extractDelta, { msg: null })).toBe(0)
  })

  it('rejects extra or missing tags at build time and at compile time', () => {
    expect(() =>
      Expr.in({ msg: Message }, ({ msg }) =>
        Expr.matchTagsExhaustive(msg, {
          Increment: () => 1,
        } as never),
      ),
    ).toThrow(/no case for/)

    expect(() =>
      Expr.in({ msg: Message }, ({ msg }) =>
        Expr.matchTags(
          msg,
          {
            NotATag: () => 1,
          } as never,
          0,
        ),
      ),
    ).toThrow(/is not a tag/)

    const _typechecks = () => {
      Expr.in({ msg: Message }, ({ msg }) =>
        // @ts-expect-error missing Decrement, SetCount, Add cases
        Expr.matchTagsExhaustive(msg, {
          Increment: () => 1,
        }),
      )

      Expr.in({ msg: Message }, ({ msg }) =>
        Expr.matchTagsExhaustive(msg, {
          // @ts-expect-error Increment variant has no `count` field
          Increment: ({ count }) => count,
          Decrement: () => -1,
          SetCount: ({ count }) => count,
          Add: ({ delta }) => delta,
        }),
      )

      Expr.in({ msg: Message }, ({ msg }) =>
        Expr.matchTags(
          msg,
          {
            // @ts-expect-error unknown tag rejected at compile time
            Ghost: () => 1,
          },
          0,
        ),
      )
    }
    expect(typeof _typechecks).toBe('function')
  })
})
