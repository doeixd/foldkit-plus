import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { describe, expect, it } from 'vitest'
import { Projection, Surface } from '../src/index.js'

const Model = Schema.Struct({
  todos: Schema.Array(Schema.Struct({ id: Schema.String, title: Schema.String })),
  selectedTodoId: Schema.NullOr(Schema.String),
})
const Message = defineMessageUnion({
  CreatedTodo: { id: Schema.String, title: Schema.String },
})
const initial = { todos: [], selectedTodoId: null }
const update = (model: typeof Model.Type, message: typeof Message.Type) =>
  Message.match(message, {
    CreatedTodo: ({ id, title }) => ({
      model: { ...model, todos: [...model.todos, { id, title }] },
    }),
  })

describe('Surface.application', () => {
  it('captures the initial Model, update, and field references', () => {
    const App = Surface.application({ Model, Message, initial, update })

    expect(App.initial).toEqual(initial)
    expect(App.update(initial, Message.CreatedTodo({ id: 'a', title: 'A' })).model.todos).toEqual([
      { id: 'a', title: 'A' },
    ])
  })

  it('keeps App.fields, deprecated, as the very references App.model holds', () => {
    const App = Surface.application({ Model, Message, initial, update })
    const Pick = Projection.pick(App.model.todos, App.model.selectedTodoId)

    expect(Pick.dependencies).toEqual([['todos'], ['selectedTodoId']])
    expect(Pick.get(initial)).toEqual({ todos: [], selectedTodoId: null })
    // Not a copy: code written against the old name selects the same fields.
    expect(App.fields).toBe(App.model)
  })
})
