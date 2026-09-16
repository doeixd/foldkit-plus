/**
 * A sync contract's wiring joins an assembly contract-only, so the Module
 * sees it. It routes nothing, runs nothing, and subscribes to nothing: Sync
 * owns the runtime through `mount` rather than joining it.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { MessageSet, Projection, Surface, type Wiring } from 'foldkit-surface'
import type * as Update from 'foldkit/update'
import { describe, expect, it } from 'vitest'
import { documentId, forApplication } from '../src/index.js'

const Todo = Schema.Struct({ id: Schema.String, title: Schema.String })
const ModelSchema = Schema.Struct({
  todos: Schema.Array(Todo),
  selectedTodoId: Schema.NullOr(Schema.String),
})
type Model = typeof ModelSchema.Type
const Message = defineMessageUnion({
  CreatedTodo: { id: Schema.String, title: Schema.String },
  RenamedTodo: { id: Schema.String, title: Schema.String },
  SelectedTodo: { id: Schema.String },
})
type Message = typeof Message.Type
const initial: Model = { todos: [], selectedTodoId: null }
const update = (model: Model, message: Message): Update.Return<Model, Message> => ({
  model: Message.match<Model>(message, {
    CreatedTodo: ({ id, title }) => ({ ...model, todos: [...model.todos, { id, title }] }),
    RenamedTodo: ({ id, title }) => ({
      ...model,
      todos: model.todos.map(todo => (todo.id === id ? { ...todo, title } : todo)),
    }),
    SelectedTodo: ({ id }) => ({ ...model, selectedTodoId: id }),
  }),
})

const App = Surface.application({ Model: ModelSchema, Message, initial, update })
const Todos = Projection.pick(App.fields.todos)
const Changes = MessageSet.make(App, [Message.CreatedTodo, Message.RenamedTodo])
const TodoSync = forApplication(App).make({
  documentId: documentId('todos'),
  shared: Todos,
  durable: Changes,
})

describe('DefinedSync.wiring', () => {
  it('joins an assembly contract-only, for the Module', () => {
    const wiring = TodoSync.wiring()
    const asWiring: Wiring<Model, never> = wiring
    expect(asWiring.key).toBe('sync:todos')
    expect(asWiring.handles).toEqual([])
    expect(asWiring.contract).toBe(TodoSync.contract)
    expect(asWiring.route).toBeUndefined()
    expect(asWiring.init).toBeUndefined()
    expect(asWiring.onUrl).toBeUndefined()
    expect(asWiring.subscriptions).toBeUndefined()
    expect(asWiring.resources).toBeUndefined()
  })
})
