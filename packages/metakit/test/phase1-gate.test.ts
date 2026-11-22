/**
 * The findings of the Phase 1 review gate, each as the reviewer's probe:
 * `Transition.commutes` over literals a set compares as one, and a seeded run
 * of both orders of every list-write pair it calls commuting over awkward
 * literals.
 */
import { Effect, Option, Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Abstract, Eq, Expr, Num, Ord, Path, Transition, Verdict } from 'metakit'
import { Text } from 'metakit/domain'
import * as Prove from 'metakit/prove'

const None = Schema.Struct({})

describe('Transition.commutes compares literals as the set does', () => {
  const State = Schema.Struct({ tags: Schema.Array(Schema.String) })
  const tag = Transition.make({
    state: State,
    input: None,
    apply: ({ state }) => [Transition.include(state.tags, '\ud800')],
  })
  const untag = Transition.make({
    state: State,
    input: None,
    apply: ({ state }) => [Transition.exclude(state.tags, '�')],
  })

  it('a lone surrogate and U+FFFD are one member: an include and an exclude of them do not decide', () => {
    expect(Verdict.isTrue(Transition.commutes(tag, untag))).toBe(false)
    const start = { tags: [] }
    const tagFirst = Result.flatMap(Transition.run(tag, start, {}), next =>
      Transition.run(untag, next, {}),
    )
    const untagFirst = Result.flatMap(Transition.run(untag, start, {}), next =>
      Transition.run(tag, next, {}),
    )
    expect(Result.getOrThrow(tagFirst).tags).toEqual([])
    expect(Result.getOrThrow(untagFirst).tags).toEqual(['�'])
  })

  it('an include stores the text as the set compares it, so two includes agree in either order', () => {
    const replacement = Transition.make({
      state: State,
      input: None,
      apply: ({ state }) => [Transition.include(state.tags, '�')],
    })
    const twice = (a: typeof tag, b: typeof tag) =>
      Result.getOrThrow(
        Result.flatMap(Transition.run(a, { tags: [] }, {}), next => Transition.run(b, next, {})),
      ).tags
    expect(twice(tag, replacement)).toEqual(twice(replacement, tag))
  })

  it('a number and text that print alike do not decide', () => {
    const Mixed = Schema.Struct({
      tags: Schema.Array(Schema.Union([Schema.Finite, Schema.String])),
    })
    const one = Transition.make({
      state: Mixed,
      input: None,
      apply: ({ state }) => [Transition.include(state.tags, 1)],
    })
    const text = Transition.make({
      state: Mixed,
      input: None,
      apply: ({ state }) => [Transition.exclude(state.tags, '1')],
    })
    expect(Verdict.isTrue(Transition.commutes(one, text))).toBe(false)
    const zero = Transition.make({
      state: Mixed,
      input: None,
      apply: ({ state }) => [Transition.exclude(state.tags, 0)],
    })
    // Excluding 0 from text is refused; excluding the text first leaves nothing to refuse it.
    expect(Verdict.isTrue(Transition.commutes(text, zero))).toBe(false)
    const run = (a: typeof one, b: typeof one) =>
      Result.isSuccess(
        Result.flatMap(Transition.run(a, { tags: ['1'] }, {}), next => Transition.run(b, next, {})),
      )
    expect([run(text, zero), run(zero, text)]).toEqual([true, false])
  })

  it('a removal by a key that may hold a NUL and another removal do not decide', () => {
    const Todos = Schema.Struct({
      todos: Schema.Array(Schema.Struct({ id: Schema.String, done: Schema.Boolean })),
    })
    const byId = Transition.make({
      state: Todos,
      input: Schema.Struct({ id: Schema.String }),
      apply: ({ state, input }) => [Transition.remove(state.todos, input.id)],
    })
    const cleared = Transition.make({
      state: Todos,
      input: None,
      apply: ({ state }) => [Transition.removeWhere(state.todos, todo => todo.done)],
    })
    expect(Verdict.isTrue(Transition.commutes(byId, cleared))).toBe(false)
    const start = { todos: [{ id: 'a', done: true }] }
    const byIdFirst = Result.flatMap(Transition.run(byId, start, { id: 'a\u0000' }), next =>
      Transition.run(cleared, next, {}),
    )
    const clearedFirst = Result.flatMap(Transition.run(cleared, start, {}), next =>
      Transition.run(byId, next, { id: 'a\u0000' }),
    )
    expect([Result.isSuccess(byIdFirst), Result.isSuccess(clearedFirst)]).toEqual([false, true])
  })
})

describe('an operand past the safe range is refused by every reader', () => {
  const Row = Schema.Struct({
    a: Schema.Int,
    f: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 2 ** 60 })),
  })
  const $ = Path.forSchema(Row)
  const reasonOf = (expr: Expr.Expr<typeof Row.Type, unknown>, env: typeof Row.Type) =>
    Result.match(Expr.evalResult(expr, env), {
      onSuccess: value => value,
      onFailure: refusal => `refused: ${refusal.reason}`,
    })

  it('the evaluator, as SQL makes the sum NULL', () => {
    const past = Ord.gt(Num.add($.a, 2 ** 60), 0)
    expect(reasonOf(past, { a: 1, f: 0 })).toBe('refused: unsafe-integer')
    for (const expr of [Num.sub($.f, 1), Num.mul($.f, 0), Num.neg($.f)]) {
      expect(reasonOf(expr, { a: 0, f: 2 ** 60 })).toBe('refused: unsafe-integer')
      expect(reasonOf(expr, { a: 0, f: 2 })).not.toBe('refused: unsafe-integer')
    }
  })

  it('the page-side judge, which no identity lets keep the operand', () => {
    // `f + 0` is refused at 2^60, so it is not `f`, and not known to equal it.
    const kept = Eq.is(Num.add($.f, 0), $.f)
    expect(reasonOf(kept, { a: 0, f: 2 ** 60 })).toBe('refused: unsafe-integer')
    expect(Verdict.isTrue(Expr.judge(kept, {}))).toBe(false)
    expect(Verdict.isTrue(Expr.judge(Eq.is(Num.add($.a, 0), $.a), {}))).toBe(true)
    expect(Expr.show(Expr.residualize(Num.add($.a, 0), {}))).toBe('a')
    expect(Expr.show(Expr.residualize(Num.add($.f, 0), {}))).toBe('(f + 0)')
    expect(Expr.show(Expr.residualize(Num.neg(Num.neg($.f)), {}))).toBe('--f')
    expect(Expr.show(Expr.residualize(Num.neg(Num.neg($.a)), {}))).toBe('a')
  })

  it('the checker, which proves no rule over an operand that may be past it', () => {
    const zero = Ord.gte(Num.mul($.f, 0), 0)
    expect(reasonOf(zero, { a: 0, f: 2 ** 60 })).toBe('refused: unsafe-integer')
    expect(Verdict.isTrue(Abstract.checkInvariant(Row, zero))).toBe(false)
    const Small = Schema.Struct({
      f: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 9 })),
    })
    const small = Path.forSchema(Small)
    expect(Verdict.isTrue(Abstract.checkInvariant(Small, Ord.gte(Num.mul(small.f, 0), 0)))).toBe(
      true,
    )
  })

  it('the prover, whose counterexample replays', async () => {
    const proof = await Effect.runPromise(Prove.invariant(Row, Ord.gte(Num.mul($.f, 0), 0)))
    expect(Verdict.isTrue(proof)).toBe(false)
    expect(Verdict.isFalse(proof)).toBe(true)
  }, 30_000)
})

describe('the solver asks again for a witness without a NUL', () => {
  const Row = Schema.Struct({ s: Schema.String })
  const $ = Path.forSchema(Row)

  it('and says so where every counterexample holds one, which no replay could show', async () => {
    // `s is s` fails only where `s` holds a NUL, which the replay never writes.
    const proof = await Effect.runPromise(Prove.invariant(Row, Eq.is($.s, $.s)))
    expect(Verdict.isUnknown(proof) && Option.getOrNull(proof.obligation)?.kind).toBe('refused')
  }, 30_000)
})

/** mulberry32: the states are the same on every run. */
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

describe('every list-write pair Transition.commutes calls commuting gives one outcome in either order', () => {
  const Todo = Schema.Struct({ id: Text.schema, title: Schema.String })
  const State = Schema.Struct({
    tags: Schema.Array(Schema.String),
    mixed: Schema.Array(Schema.Union([Schema.Finite, Schema.String])),
    todos: Schema.Array(Todo),
  })
  type State = typeof State.Type
  type AnyTransition = Transition.Transition<State, {}, never>

  const texts = ['\ud800', '�', 'a', '', '1', '0', 'a\u0000', '\u0000']
  const numbers = [1, 0, -0, 0.5]
  const scalars: ReadonlyArray<number | string> = [...texts, ...numbers]

  const entries: ReadonlyArray<readonly [string, AnyTransition]> = [
    ...texts.flatMap(text => [
      [
        `include tags ${JSON.stringify(text)}`,
        Transition.make({
          state: State,
          input: None,
          apply: ({ state }) => [Transition.include(state.tags, text)],
        }),
      ] as const,
      [
        `exclude tags ${JSON.stringify(text)}`,
        Transition.make({
          state: State,
          input: None,
          apply: ({ state }) => [Transition.exclude(state.tags, text)],
        }),
      ] as const,
      [
        `remove todo ${JSON.stringify(text)}`,
        Transition.make({
          state: State,
          input: None,
          apply: ({ state }) => [Transition.remove(state.todos, text)],
        }),
      ] as const,
      [
        `patch todo ${JSON.stringify(text)}`,
        Transition.make({
          state: State,
          input: None,
          apply: ({ state }) => [Transition.patch(state.todos, text, () => ({ title: text }))],
        }),
      ] as const,
    ]),
    ...scalars.flatMap(scalar => [
      [
        `include mixed ${String(scalar)}`,
        Transition.make({
          state: State,
          input: None,
          apply: ({ state }) => [Transition.include(state.mixed, scalar)],
        }),
      ] as const,
      [
        `exclude mixed ${String(scalar)}`,
        Transition.make({
          state: State,
          input: None,
          apply: ({ state }) => [Transition.exclude(state.mixed, scalar)],
        }),
      ] as const,
    ]),
  ]

  const states: ReadonlyArray<State> = (() => {
    const random = seeded(41)
    const pick = <A>(pool: ReadonlyArray<A>): A => pool[Math.floor(random() * pool.length)]!
    const portable = texts.filter(text => !text.includes('\u0000'))
    // Sets as includes leave them: sorted by code point, one kind each. A lone
    // surrogate one held before includes stored well-formed text sorts as U+FFFD.
    const tagSets: ReadonlyArray<ReadonlyArray<string>> = [
      [],
      [''],
      ['1'],
      ['0', 'a'],
      ['�'],
      ['a', '\ud800'],
      ['', '1', 'a', '�'],
    ]
    const mixedSets: ReadonlyArray<ReadonlyArray<number | string>> = [
      ...tagSets,
      [0],
      [0.5],
      [0, 0.5, 1],
    ]
    return Array.from({ length: 30 }, () => ({
      tags: pick(tagSets),
      mixed: pick(mixedSets),
      todos: Array.from({ length: pick([0, 1, 2]) }, () => ({
        id: pick(portable),
        title: pick(portable),
      })),
    }))
  })()

  const shown = (outcome: Result.Result<State, Transition.Refused>): string =>
    Result.match(outcome, {
      onFailure: () => 'refused',
      onSuccess: state =>
        JSON.stringify(state, (_, value) => (Object.is(value, -0) ? '-0' : value)),
    })

  const then = (state: State, first: AnyTransition, second: AnyTransition) =>
    shown(
      Result.flatMap(Transition.run(first, state, {}), next => Transition.run(second, next, {})),
    )

  it('calls some pairs of each way commuting, and runs both orders of each', () => {
    const commuting = entries.flatMap(([nameA, a]) =>
      entries.flatMap(([nameB, b]) =>
        Verdict.isTrue(Transition.commutes(a, b)) ? [[nameA, a, nameB, b] as const] : [],
      ),
    )
    for (const way of ['include tags', 'exclude mixed', 'remove todo', 'patch todo']) {
      expect(commuting.some(([nameA]) => nameA.startsWith(way))).toBe(true)
    }
    const parted = new Set<string>()
    for (const [nameA, a, nameB, b] of commuting) {
      for (const state of states) {
        if (then(state, a, b) !== then(state, b, a)) parted.add(`${nameA} then ${nameB}`)
      }
    }
    expect([...parted]).toEqual([])
    // About 10 seconds while the other suites run beside it.
  }, 60_000)
})
