import { Schema } from 'effect'
import * as Machine from '../src/machine.js'
import * as Path from '../src/path.js'
import * as Transition from '../src/transition.js'

const Todo = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
})

const AppModel = Schema.Struct({
  todos: Schema.Array(Todo),
})

const TodoMachine = Machine.make({
  state: Todo,
  transitions: {
    Renamed: Transition.make({
      state: Todo,
      input: Schema.Struct({ title: Schema.String }),
      apply: ({ state, input }) => [Transition.set(state.title, input.title)],
    }),
  },
})

// @ts-expect-error 'noSuchKey' is not a field of Todo
Machine.each(Path.from(AppModel).todos, 'noSuchKey', TodoMachine)

const Composed = Machine.compose({
  state: AppModel,
  transitions: {},
  children: {
    '': Machine.each(Path.from(AppModel).todos, 'id', TodoMachine),
  },
})

const sample: typeof AppModel.Type = { todos: [] }

Composed.dispatch(sample, { _tag: 'Renamed', input: { id: 'a', title: 'Next' } })

// @ts-expect-error child Message is missing the required key field `id`
Composed.dispatch(sample, { _tag: 'Renamed', input: { title: 'Next' } })

// @ts-expect-error key field `id` must be string, not number
Composed.dispatch(sample, { _tag: 'Renamed', input: { id: 42, title: 'Next' } })
