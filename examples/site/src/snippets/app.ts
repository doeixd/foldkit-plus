import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Surface } from 'foldkit-surface'

const Todo = Schema.Struct({ id: Schema.String, title: Schema.String, done: Schema.Boolean })

export const Model = Schema.Struct({
  todos: Schema.Array(Todo),
  filter: Schema.Literals(['all', 'active', 'done']),
  selected: Schema.Option(Schema.String),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  AddedTodo: { id: Schema.String, title: Schema.String },
  ToggledTodo: { id: Schema.String },
  ChangedFilter: { filter: Schema.Literals(['all', 'active', 'done']) },
  SelectedTodo: { id: Schema.String },
})
export type Message = typeof Message.Type

// One Model, one Message union, one update: the whole application.
export const App = Surface.application({
  Model,
  Message,
  initial: { todos: [], filter: 'all', selected: Option.none() },
  update: (model, message) =>
    Message.match(message, {
      AddedTodo: ({ id, title }) => ({
        model: modifyFields(model, { todos: todos => [...todos, { id, title, done: false }] }),
      }),
      ToggledTodo: ({ id }) => ({
        model: modifyFields(model, {
          todos: todos =>
            todos.map(todo => (todo.id === id ? { ...todo, done: !todo.done } : todo)),
        }),
      }),
      ChangedFilter: ({ filter }) => ({ model: modifyFields(model, { filter: () => filter }) }),
      SelectedTodo: ({ id }) => ({
        model: modifyFields(model, { selected: () => Option.some(id) }),
      }),
    }),
})

// A boundary: what the list may read, and the Messages it may send.
export const TodoList = App.surface('TodoList', {
  model: ({ model }) => ({ todos: model.todos, filter: model.filter }),
  messages: [Message.ToggledTodo, Message.ChangedFilter],
})
