/**
 * The Quick start and the Surfaces section of this package's README,
 * type-checked so the documentation cannot drift from the API. `todosById`
 * is added to the Model for the dynamic-lookup example.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Projection, Surface } from '../src/index.js'

const Todo = Schema.Struct({ id: Schema.String, title: Schema.String, done: Schema.Boolean })
const Model = Schema.Struct({
  todos: Schema.Array(Todo),
  todosById: Schema.Record(Schema.String, Todo),
  selectedTodoId: Schema.NullOr(Schema.String),
})
const Message = defineMessageUnion({
  CreatedTodo: { id: Schema.String, title: Schema.String },
  ToggledTodo: { id: Schema.String },
  SelectedTodo: { id: Schema.String },
})

const update = (model: typeof Model.Type, message: typeof Message.Type) => {
  switch (message._tag) {
    case 'CreatedTodo':
      return {
        model: {
          ...model,
          todos: [...model.todos, { id: message.id, title: message.title, done: false }],
        },
      }
    case 'ToggledTodo':
      return {
        model: {
          ...model,
          todos: model.todos.map(todo =>
            todo.id === message.id ? { ...todo, done: !todo.done } : todo,
          ),
        },
      }
    case 'SelectedTodo':
      return { model: { ...model, selectedTodoId: message.id } }
  }
}

const App = Surface.application({
  Model,
  Message,
  initial: { todos: [], todosById: {}, selectedTodoId: null },
  update,
})

const TodoList = App.surface('TodoList', {
  model: ({ model }) => ({ todos: model.todos, selectedTodoId: model.selectedTodoId }),
  messages: [Message.ToggledTodo, Message.SelectedTodo],
})
const _todoList: Surface<
  typeof Model.Type,
  { readonly todos: ReadonlyArray<typeof Todo.Type>; readonly selectedTodoId: string | null },
  typeof Message.ToggledTodo.Type | typeof Message.SelectedTodo.Type,
  void
> = TodoList

const Shared = Projection.pick(App.fields.todos, App.fields.selectedTodoId)
void Shared

// Surfaces
const TodoDetail = App.surface('TodoDetail', {
  model: ({ model }) => ({ todos: model.todos, selectedTodoId: model.selectedTodoId }),
  messages: [Message.ToggledTodo],
})
const ById = App.surface('ById', {
  params: { id: Schema.String },
  model: ({ model, params }) => ({ todo: model.todosById.at(params.id) }),
})
declare const root: typeof Model.Type
Surface.read(TodoDetail, root)
Surface.read(ById, root, { id: 't1' })
Surface.at(ById, model =>
  model.selectedTodoId === null ? undefined : { id: model.selectedTodoId },
)

// The explicit form
const Explicit = Surface.make(App, 'TodoDetailExplicit', {
  Params: Schema.Struct({ id: Schema.String }),
  model: ({ model, params }) => Projection.struct({ todo: model.todosById.at(params.id) }),
  messages: [Message.ToggledTodo],
})
void Explicit
