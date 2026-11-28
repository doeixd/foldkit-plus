import { Option, Result, Schema } from 'effect'
import { Path, Transition } from 'metakit'
import { expect, it } from 'vitest'

const Todo = Schema.Struct({ id: Schema.String, title: Schema.String, done: Schema.Boolean })
const Todos = Schema.Struct({ rows: Schema.Array(Todo), remaining: Schema.Int })
const Empty = Schema.Struct({})
const fixture: typeof Todos.Type = {
  rows: [
    { id: 'one', title: 'First', done: false },
    { id: 'two', title: 'Second', done: false },
  ],
  remaining: 2,
}

it('keeps no-op state writes empty and returns emitted records', () => {
  const Announce = Transition.make({
    state: Todos,
    input: Empty,
    apply: ({ state }) => [Transition.set(state.remaining, state.remaining)],
    emits: ({ state }) => [Transition.emit('Counted', { remaining: state.remaining })],
  })
  const result = Result.getOrThrow(Transition.stepObserved(Announce, fixture, {}))
  expect(result.state).toBe(fixture)
  expect(result.writes).toEqual([])
  expect(result.emitted).toEqual([{ _tag: 'Counted', remaining: 2 }])
})

it('observes only the changed field of a keyed row after reordering and lifting', () => {
  const Rename = Transition.make({
    state: Todos,
    input: Schema.Struct({ id: Schema.String, title: Schema.String }),
    apply: ({ state, input }) => [
      Transition.patch(state.rows, input.id, row => ({ title: input.title, done: row.done })),
    ],
  })
  const Parent = Schema.Struct({ todos: Todos })
  const Lifted = Transition.lift(Path.from(Parent).todos, Rename)
  for (const rows of [fixture.rows, [...fixture.rows].reverse()]) {
    const state = { todos: { ...fixture, rows } }
    const result = Result.getOrThrow(
      Transition.stepObserved(Lifted, state, { id: 'one', title: 'New' }),
    )
    expect(result.writes).toEqual([
      {
        kind: 'keyed-field',
        path: ['todos', 'rows'],
        key: { field: 'id', value: 'one' },
        field: 'title',
      },
    ])
    expect(result.state.todos.rows.find(row => row.id === 'two')).toBe(fixture.rows[1])
  }
})

it('distinguishes list membership from a write with conservative scope', () => {
  const Add = Transition.make({
    state: Todos,
    input: Todo,
    apply: ({ state, input }) => [Transition.insert(state.rows, input)],
  })
  const added = Result.getOrThrow(
    Transition.stepObserved(Add, fixture, { id: 'three', title: 'Third', done: false }),
  )
  expect(added.writes).toEqual([{ kind: 'membership', path: ['rows'] }])
  const duplicate = Result.getOrThrow(Transition.stepObserved(Add, fixture, fixture.rows[0]!))
  expect(duplicate.writes).toEqual([])

  let calls = 0
  const Clear = Transition.opaque({
    name: 'Clear',
    state: Todos,
    input: Empty,
    reads: ({ state }) => [state.rows],
    writes: ({ state }) => [state.rows, state.remaining],
    run: () => {
      calls++
      return { rows: [], remaining: 0 }
    },
  })
  expect(Result.getOrThrow(Transition.stepObserved(Clear, fixture, {})).writes).toEqual([
    { kind: 'path', path: ['rows'] },
    { kind: 'path', path: ['remaining'] },
  ])
  expect(calls).toBe(1)
})

it('returns no successful delta when a later write is refused', () => {
  const State = Schema.Struct({
    count: Schema.Int,
    other: Schema.Option(Schema.Struct({ value: Schema.Int })),
  })
  const Update = Transition.make({
    state: State,
    input: Empty,
    apply: ({ state }) => [Transition.set(state.count, 1), Transition.set(state.other.value, 4)],
  })
  const result = Transition.stepObserved(Update, { count: 0, other: Option.some({ value: 0 }) }, {})
  expect(Result.isFailure(result) && result.failure.reason).toContain('inside the Option')
})
