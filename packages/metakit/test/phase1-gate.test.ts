/**
 * The findings of the Phase 1 review gate, each as the reviewer's probe:
 * `Transition.commutes` over literals a set compares as one, and a seeded run
 * of both orders of every list-write pair it calls commuting over awkward
 * literals.
 */
import { Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Transition, Verdict } from 'metakit'
import { Text } from 'metakit/domain'

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
  })
})
