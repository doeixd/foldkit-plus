import { Schema } from 'effect'
import { evo } from 'foldkit/struct'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'

const Todo = Schema.Struct({ id: Schema.String, title: Schema.String })
export const Shared = Schema.Struct({ todos: Schema.Array(Todo) })
export type Shared = typeof Shared.Type
export const encodeShared = Schema.encodeSync(Shared)
export const Model = Schema.Struct({
  ...Shared.fields,
  selectedTodoId: Schema.NullOr(Schema.String),
  lastError: Schema.NullOr(Schema.String),
})
export type Model = typeof Model.Type
export const Message = defineMessageUnion({
  CreatedTodo: { id: Schema.String, title: Schema.String },
  RenamedTodo: { id: Schema.String, title: Schema.String },
  DeletedTodo: { id: Schema.String },
  SelectedTodo: { id: Schema.String },
})
export type Message = typeof Message.Type
export const initialModel: Model = { todos: [], selectedTodoId: null, lastError: null }

// IDs and all other nondeterministic inputs come from the Message.
export const update = (model: Model, message: Message): Update.Return<Model, Message> => ({
  model: Message.match(message, {
    CreatedTodo: ({ id, title }) =>
      evo(model, {
        todos: () =>
          model.todos.some(todo => todo.id === id) ? model.todos : [...model.todos, { id, title }],
      }),
    RenamedTodo: ({ id, title }) =>
      evo(model, {
        todos: () => model.todos.map(todo => (todo.id === id ? { ...todo, title } : todo)),
      }),
    DeletedTodo: ({ id }) =>
      evo(model, { todos: () => model.todos.filter(todo => todo.id !== id) }),
    SelectedTodo: ({ id }) => evo(model, { selectedTodoId: () => id }),
  }),
})

export const decodeMessage = Schema.decodeUnknownSync(Message, { onExcessProperty: 'error' })
export const encodeMessage = Schema.encodeSync(Message)
