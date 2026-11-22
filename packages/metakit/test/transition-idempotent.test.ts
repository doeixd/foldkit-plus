/**
 * `Transition.idempotent`: each rule of its five, and a run of every
 * transition it calls idempotent, twice in a row, over states the Model holds.
 */
import { Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Bool, Expr, Num, Str, Transition, Verdict } from 'metakit'

const Todo = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  completed: Schema.Boolean,
  rank: Schema.Int.check(Schema.isBetween({ minimum: -9, maximum: 9 })),
})
type Todo = typeof Todo.Type

const Model = Schema.Struct({
  todos: Schema.Array(Todo),
  tags: Schema.Array(Schema.String),
  count: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1000 })),
  title: Schema.String,
  other: Schema.String,
})
type Model = typeof Model.Type

const Input = Schema.Struct({ id: Schema.String, title: Schema.String })
type Input = typeof Input.Type
type Step = Transition.Transition<Model, Input, unknown>

const row = (id: string, completed: boolean, rank = 0): Todo => ({
  id,
  title: id,
  completed,
  rank,
})
const states: ReadonlyArray<Model> = [
  { todos: [], tags: [], count: 0, title: '', other: '' },
  {
    todos: [row('a', true), row('b', false, 3)],
    tags: ['x'],
    count: 4,
    title: 'a',
    other: 'b',
  },
  {
    todos: [row('a', false, -2)],
    tags: ['x', 'y'],
    count: 999,
    title: 'x',
    other: 'x',
  },
]
const inputs: ReadonlyArray<Input> = [
  { id: 'a', title: 'x' },
  { id: 'b', title: 'a' },
  { id: 'zz', title: '' },
]

type Config = Parameters<typeof Transition.make<typeof Model, typeof Input>>[0]
const make = (apply: Config['apply'], when?: Config['when']): Step =>
  Transition.make({ state: Model, input: Input, apply, ...(when === undefined ? {} : { when }) })

const cases: Readonly<Record<string, Step>> = {
  'sets a field from the input': make(({ state, input }) => [
    Transition.set(state.title, input.title),
  ]),
  'inserts an element': make(({ state, input }) => [
    Transition.insert(state.todos, { id: input.id, title: input.title, completed: false, rank: 0 }),
  ]),
  'removes an element by key': make(({ state, input }) => [
    Transition.remove(state.todos, input.id),
  ]),
  'removes the elements a test picks': make(({ state }) => [
    Transition.removeWhere(state.todos, todo => todo.completed),
  ]),
  'patches a field from the input': make(({ state, input }) => [
    Transition.patch(state.todos, input.id, () => ({ title: input.title })),
  ]),
  'patches a field from another field': make(({ state, input }) => [
    Transition.patch(state.todos, input.id, todo => ({ completed: Num.gt(todo.rank, 0) })),
  ]),
  'includes a member': make(({ state, input }) => [Transition.include(state.tags, input.id)]),
  'writes two fields apart': make(({ state, input }) => [
    Transition.set(state.title, input.title),
    Transition.set(state.other, Str.trim(input.id)),
  ]),
  'is guarded by a field it does not write': make(
    ({ state, input }) => [Transition.set(state.title, input.title)],
    ({ state }) => Num.gt(state.count, 3),
  ),
}

const refused: Readonly<Record<string, Step>> = {
  'adds an amount': make(({ state }) => [Transition.add(state.count, 1)]),
  'appends an element': make(({ state, input }) => [Transition.append(state.tags, input.id)]),
  'toggles a field, setting it from itself': make(({ state, input }) => [
    Transition.patch(state.todos, input.id, todo => ({ completed: Bool.not(todo.completed) })),
  ]),
  'sets a field from itself': make(({ state, input }) => [
    Transition.set(state.title, Str.trim(state.title)),
    Transition.set(state.other, input.title),
  ]),
  'is guarded by a field it writes': make(
    ({ state, input }) => [Transition.set(state.title, input.title)],
    ({ state }) => Str.isEmpty(state.title),
  ),
  'sets a field from code that reads only the input': make(({ state, input }) => [
    Transition.set(
      state.title,
      Expr.opaque({ reads: [input.title] }, () => 'x'),
    ),
  ]),
  'emits a record': Transition.make({
    state: Model,
    input: Input,
    apply: ({ state, input }) => [Transition.set(state.title, input.title)],
    emits: ({ input }) => [Transition.emit('Noted', { id: input.id })],
  }),
  'is an opaque step': Transition.opaque({
    name: 'Opaque',
    state: Model,
    input: Input,
    reads: ({ input }) => [input.title],
    writes: ({ state }) => [state.title],
    run: (state, input) => ({ ...state, title: `${state.title}${input.title}` }),
  }),
}

const twice = (transition: Step, state: Model, input: Input) => {
  const first = Transition.run(transition, state, input)
  const second = Result.isSuccess(first) ? Transition.run(transition, first.success, input) : first
  return [first, second] as const
}

describe('Transition.idempotent', () => {
  it.each(Object.entries(cases))('is true of a transition that %s', (_name, transition) => {
    expect(Verdict.isTrue(Transition.idempotent(transition))).toBe(true)
  })

  it.each(Object.entries(refused))(
    'says why it does not decide one that %s',
    (_name, transition) => {
      const verdict = Transition.idempotent(transition)
      expect(Verdict.isUnknown(verdict) && verdict.reason.length > 0).toBe(true)
    },
  )

  it('leaves what once leaves, over states and inputs, for every transition it calls idempotent', () => {
    let ran = 0
    for (const transition of Object.values(cases)) {
      for (const state of states) {
        for (const input of inputs) {
          const [first, second] = twice(transition, state, input)
          ran++
          expect(JSON.stringify(second)).toBe(JSON.stringify(first))
        }
      }
    }
    expect(ran).toBe(Object.keys(cases).length * states.length * inputs.length)
  })

  it('is not true of a toggle, which gives another state the second time', () => {
    const [first, second] = twice(
      refused['toggles a field, setting it from itself']!,
      states[1]!,
      inputs[0]!,
    )
    expect(JSON.stringify(second)).not.toBe(JSON.stringify(first))
  })
})
