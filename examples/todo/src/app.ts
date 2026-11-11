import { Effect, Option, Schema } from 'effect'
import * as Command from 'foldkit/command'
import { modifyFields } from 'foldkit/struct'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'

/** The application half of the example: an ordinary Foldkit Model and Message union. */

export const Todo = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  completed: Schema.Boolean,
})

export type Todo = typeof Todo.Type

export const Model = Schema.Struct({
  todos: Schema.Array(Todo),
  selectedTodoId: Schema.Option(Schema.String),
  lastError: Schema.Option(Schema.String),
  /** The number the next todo's id takes, kept in the Model so a fresh one starts again. */
  nextId: Schema.Number,
})

export type Model = typeof Model.Type

/**
 * Semantic, surface-independent Messages.
 *
 * `RequestedDeleteTodo` rather than `ClickedDeleteButton`, so a button and an
 * agent can originate the same transition.
 */
export const Message = defineMessageUnion({
  /**
   * Someone asked for a todo. It is not in the list until `SubmittedTodo`, the
   * fact, lands. `requestId` is the call waiting for that fact (an agent's
   * invocation), so two requests for one title are told apart.
   */
  RequestedCreateTodo: { title: Schema.String, requestId: Schema.optionalKey(Schema.String) },
  RequestedRenameTodo: { id: Schema.String, title: Schema.String },
  RequestedDeleteTodo: { id: Schema.String },
  RequestedToggleTodo: { id: Schema.String },
  SelectedTodo: { id: Schema.String },
  ClearedSelection: {},

  // Internal. Never exposed: an agent has no business originating these.
  /** The todo was saved. Carries the request it answers, where one waits. */
  SubmittedTodo: {
    id: Schema.String,
    title: Schema.String,
    requestId: Schema.optionalKey(Schema.String),
  },
  ReceivedTodos: { todos: Schema.Array(Todo) },
  FailedToLoadTodos: { message: Schema.String },
})

export type Message = typeof Message.Type

export const initialModel: Model = {
  todos: [],
  selectedTodoId: Option.none(),
  lastError: Option.none(),
  nextId: 1,
}

type Return = Update.Return<Model, Message>

/**
 * Stands in for the I/O a real create waits on (a save, a server's answer):
 * a Command, so the todo appears only when its fact comes back.
 */
const SaveTodo = Command.define('SaveTodo', {
  args: { id: Schema.String, title: Schema.String, requestId: Schema.optionalKey(Schema.String) },
  messages: [Message.SubmittedTodo],
  execute: todo => Effect.succeed(Message.SubmittedTodo(todo)),
})

/** The state transition function: a Model, and the Commands to run after it. */
export const update = (model: Model, message: Message): Return =>
  Message.match<Return>(message, {
    // The id is reserved here, so two requests in flight never share one; the
    // todo itself waits for the fact.
    RequestedCreateTodo: ({ title, requestId }) => ({
      model: modifyFields(model, { nextId: () => model.nextId + 1 }),
      commands: [
        SaveTodo({
          id: `todo-${model.nextId}`,
          title,
          ...(requestId === undefined ? {} : { requestId }),
        }),
      ],
    }),

    SubmittedTodo: ({ id, title }) => ({
      model: modifyFields(model, {
        todos: () => [...model.todos, { id, title, completed: false }],
      }),
    }),

    RequestedRenameTodo: ({ id, title }) => ({
      model: modifyFields(model, {
        todos: () => model.todos.map(todo => (todo.id === id ? { ...todo, title } : todo)),
      }),
    }),

    RequestedDeleteTodo: ({ id }) => ({
      model: modifyFields(model, {
        todos: () => model.todos.filter(todo => todo.id !== id),
        selectedTodoId: () => Option.filter(model.selectedTodoId, selected => selected !== id),
      }),
    }),

    RequestedToggleTodo: ({ id }) => ({
      model: modifyFields(model, {
        todos: () =>
          model.todos.map(todo =>
            todo.id === id ? { ...todo, completed: !todo.completed } : todo,
          ),
      }),
    }),

    SelectedTodo: ({ id }) => ({
      model: modifyFields(model, { selectedTodoId: () => Option.some(id) }),
    }),

    ClearedSelection: () => ({
      model: modifyFields(model, { selectedTodoId: () => Option.none() }),
    }),

    ReceivedTodos: ({ todos }) => ({ model: modifyFields(model, { todos: () => todos }) }),

    FailedToLoadTodos: ({ message }) => ({
      model: modifyFields(model, { lastError: () => Option.some(message) }),
    }),
  })
