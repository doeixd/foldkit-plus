/**
 * The "Sixty seconds of code" sample in the repository README, type-checked so
 * the project's front page cannot drift from the API. The Model, Message union,
 * and `update` stand in for the ones the README says are the application's own;
 * everything below them is the sample verbatim.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Agent } from 'foldkit-agent'
import { Mirror } from 'foldkit-mirror'
import { MessageSet, Module, Projection, Surface } from 'foldkit-surface'
import { documentId, forApplication } from 'foldkit-sync'

const Todo = Schema.Struct({ id: Schema.String, title: Schema.String, done: Schema.Boolean })
const Model = Schema.Struct({
  todos: Schema.Array(Todo),
  filter: Schema.Literals(['all', 'active', 'done']),
})
const Message = defineMessageUnion({
  ...Mirror.messages,
  SubmittedTodo: { id: Schema.String, title: Schema.String },
  ToggledTodo: { id: Schema.String },
  DeletedTodo: { id: Schema.String },
})
const initial: typeof Model.Type = { todos: [], filter: 'all' }

const update = (model: typeof Model.Type, message: typeof Message.Type) => {
  switch (message._tag) {
    case 'SubmittedTodo':
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
    case 'DeletedTodo':
      return { model: { ...model, todos: model.todos.filter(todo => todo.id !== message.id) } }
    default:
      return { model }
  }
}

// --- the README sample ------------------------------------------------------

// The application: an ordinary Model, Message union, and update.
const App = Surface.application({ Model, Message, initial, update })

// What the board renders, and the only Messages it may cause.
const Board = App.surface('Board', {
  model: ({ model }) => ({ todos: model.todos, filter: model.filter }),
  messages: [Message.ToggledTodo, Message.DeletedTodo],
})

// What replicates: this slice, changed by these Messages, replayed through update.
const TodoSync = forApplication(App).make({
  documentId: documentId('todos'),
  shared: Projection.pick(App.fields.todos),
  durable: MessageSet.make(App, [Message.SubmittedTodo, Message.ToggledTodo, Message.DeletedTodo]),
})

// What an agent may see (a Surface) and do (Messages update already handles).
const TodoAgent = Agent.forApplication(App)
const AppAgent = TodoAgent.make({
  context: Board,
  messages: TodoAgent.expose(Message, {
    ToggledTodo: { name: 'toggle_todo', description: 'Mark a todo done, or undo that' },
  }),
})

// What the URL shows. Reduced back into the Model on navigation.
const Filters = Mirror.url(App, { fields: [App.fields.filter] })

// The application as data: one owner per field, every Message accounted for.
Module.validate(Module.make(App, [Board, TodoSync, AppAgent, Filters.contract])) // []
