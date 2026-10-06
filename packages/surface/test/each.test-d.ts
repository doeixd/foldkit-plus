import { Schema } from 'effect'
import { Projection, Surface } from '../src/index.js'
import { App, Message } from './todoFixture.js'

const Board = App.surface('Board', {
  model: ({ model }) => Projection.struct({ todos: model.todos }),
  messages: [],
})

const Card = App.surface('Card', {
  params: { id: Schema.String },
  model: ({ model, params }) => ({
    id: Projection.fromReader(Schema.String, () => params.id, { dependencies: [] }),
    todos: model.todos,
  }),
  messages: [Message.RenamedTodo],
})

// The parent Model arrives typed: no annotation needed on `parent`.
export const Cards = Surface.each(Card, {
  from: Surface.at(Board, undefined),
  instances: parent => {
    const todos: ReadonlyArray<{ readonly id: string; readonly title: string }> = parent.todos
    return todos.map(todo => ({ key: todo.id, params: { id: todo.id } }))
  },
})

// Instance params must match the child's Params.
export const BadCards = Surface.each(Card, {
  from: Surface.at(Board, undefined),
  instances: () => [
    // @ts-expect-error: id is a string, not a number
    { key: 't1', params: { id: 42 } },
  ],
})
