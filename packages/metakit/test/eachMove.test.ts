import { Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import * as Bool from '../src/ops/bool.js'
import * as Machine from '../src/machine.js'
import * as Path from '../src/path.js'
import * as Transition from '../src/transition.js'
import * as Verdict from '../src/verdict.js'

const Todo = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  completed: Schema.Boolean,
})
type Todo = typeof Todo.Type

const AppModel = Schema.Struct({
  todos: Schema.Array(Todo),
})
type AppModel = typeof AppModel.Type

const TodoMachine = Machine.make({
  state: Todo,
  transitions: {
    Renamed: Transition.make({
      state: Todo,
      input: Schema.Struct({ title: Schema.String }),
      apply: ({ state, input }) => [Transition.set(state.title, input.title)],
    }),
    Toggled: Transition.make({
      state: Todo,
      input: Schema.Struct({}),
      apply: ({ state }) => [Transition.set(state.completed, Bool.not(state.completed))],
    }),
    ArchiveIfDone: Transition.make({
      state: Todo,
      input: Schema.Struct({ title: Schema.String }),
      when: ({ state }) => state.completed,
      apply: ({ state, input }) => [Transition.set(state.title, input.title)],
    }),
  },
})

const EachApp = Machine.compose({
  state: AppModel,
  transitions: {
    MovedTodo: Transition.make({
      state: AppModel,
      input: Schema.Struct({ id: Schema.String, toIndex: Schema.Int }),
      apply: ({ state, input }) => [Transition.move(state.todos, input.id, input.toIndex)],
    }),
  },
  children: {
    '': Machine.each(Path.from(AppModel).todos, 'id', TodoMachine),
  },
})

const PatchApp = Machine.make({
  state: AppModel,
  transitions: {
    Renamed: Transition.make({
      state: AppModel,
      input: Schema.Struct({ id: Schema.String, title: Schema.String }),
      apply: ({ state, input }) => [
        Transition.patch(state.todos, input.id, () => ({ title: input.title })),
      ],
    }),
  },
})

describe('Machine.each & Transition.move (Bout 3.2)', () => {
  it('replays RenamedTodo via Machine.each identically to Transition.patch, preserving identity on no-ops', () => {
    const start: AppModel = {
      todos: [
        { id: 'a', title: 'Milk', completed: false },
        { id: 'b', title: 'Eggs', completed: true },
        { id: 'c', title: 'Bread', completed: false },
      ],
    }

    // Deterministic seeded sequence including hits, no-op same-title renames, and missing ids.
    const steps: ReadonlyArray<{ readonly id: string; readonly title: string }> = [
      { id: 'a', title: 'Oat milk' },
      { id: 'a', title: 'Oat milk' }, // no-op: same title
      { id: 'missing', title: 'Ghost' }, // no-op: missing key
      { id: 'c', title: 'Sourdough' },
      { id: 'b', title: 'Eggs' }, // no-op: unchanged
      { id: 'b', title: 'Organic eggs' },
    ]

    let eachState = start
    let patchState = start
    for (const input of steps) {
      const [nextEach] = EachApp.update(eachState, { _tag: 'Renamed', input })
      const [nextPatch] = PatchApp.update(patchState, { _tag: 'Renamed', input })
      expect(nextEach).toEqual(nextPatch)
      if (nextPatch === patchState) {
        expect(nextEach).toBe(eachState)
      }
      eachState = nextEach
      patchState = nextPatch
    }
  })

  it('enforces child guards and lets disjoint-field child transitions commute', () => {
    const state: AppModel = {
      todos: [
        { id: 'a', title: 'Milk', completed: false },
        { id: 'b', title: 'Eggs', completed: true },
      ],
    }
    const refused = EachApp.dispatch(state, {
      _tag: 'ArchiveIfDone',
      input: { id: 'a', title: '[archived] Milk' },
    })
    expect(Result.isFailure(refused)).toBe(true)

    const accepted = EachApp.dispatch(state, {
      _tag: 'ArchiveIfDone',
      input: { id: 'b', title: '[archived] Eggs' },
    })
    expect(Result.isSuccess(accepted)).toBe(true)
    if (Result.isSuccess(accepted)) {
      expect(accepted.success.state.todos[1]?.title).toBe('[archived] Eggs')
    }

    // Renamed sets `title`, Toggled sets `completed`: disjoint fields commute!
    const verdict = Transition.commutes(EachApp.transitions.Renamed, EachApp.transitions.Toggled)
    expect(Verdict.isTrue(verdict)).toBe(true)
  })

  it('refuses a key field that does not exist on the element schema', () => {
    expect(() => Machine.each(Path.from(AppModel).todos, 'missing' as never, TodoMachine)).toThrow(
      '[metakit] Machine.each: the element of "todos" has no key field "missing"; give the field each element is identified by.',
    )
  })

  it('moves elements by key, clamps bounds, is idempotent, and commutes with nothing', () => {
    const start: AppModel = {
      todos: [
        { id: 'a', title: 'A', completed: false },
        { id: 'b', title: 'B', completed: false },
        { id: 'c', title: 'C', completed: false },
      ],
    }

    // Move 'c' to index 0 -> ['c', 'a', 'b']
    const [m1] = EachApp.update(start, { _tag: 'MovedTodo', input: { id: 'c', toIndex: 0 } })
    expect(m1.todos.map(t => t.id)).toEqual(['c', 'a', 'b'])

    // Moving 'c' to index 0 again is a no-op keeping identity!
    const [m1Again] = EachApp.update(m1, { _tag: 'MovedTodo', input: { id: 'c', toIndex: 0 } })
    expect(m1Again).toBe(m1)

    // Clamping out-of-range indices: toIndex 99 -> end; toIndex -5 -> start.
    const [m2] = EachApp.update(m1, { _tag: 'MovedTodo', input: { id: 'c', toIndex: 99 } })
    expect(m2.todos.map(t => t.id)).toEqual(['a', 'b', 'c'])
    const [m3] = EachApp.update(m2, { _tag: 'MovedTodo', input: { id: 'c', toIndex: -5 } })
    expect(m3.todos.map(t => t.id)).toEqual(['c', 'a', 'b'])

    // Missing key keeps identity.
    const [mMissing] = EachApp.update(m3, { _tag: 'MovedTodo', input: { id: 'z', toIndex: 1 } })
    expect(mMissing).toBe(m3)

    // Algebraic properties: idempotent, commutes with nothing.
    expect(Verdict.isTrue(Transition.idempotent(EachApp.transitions.MovedTodo))).toBe(true)
    expect(
      Verdict.isUnknown(
        Transition.commutes(EachApp.transitions.MovedTodo, EachApp.transitions.MovedTodo),
      ),
    ).toBe(true)
    expect(
      Verdict.isUnknown(
        Transition.commutes(EachApp.transitions.MovedTodo, EachApp.transitions.Renamed),
      ),
    ).toBe(true)
  })
})
