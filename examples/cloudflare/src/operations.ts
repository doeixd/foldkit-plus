/**
 * What the page may ask of the server. The list is one query. Each write is a
 * mutation whose input is the value the page submits, except create: the form
 * only has a title, and the page mints the id so the optimistic row and the
 * stored row are the same one.
 */
import { Schema } from 'effect'
import { Mutation, Query } from 'foldkit-remote'
import { Todo } from './domain.js'

export const AllTodos = Query.make('AllTodos', {
  Input: Schema.Struct({}),
  Result: Query.connection(Todo),
})

/** The page and the live list watch share this window, so neither can drift. */
export const TODO_PAGE_SIZE = 100

const title = Todo.fields.title.schema
const done = Todo.fields.done.schema

export const CreateTodo = Mutation.make('CreateTodo', {
  Input: Schema.Struct({ id: Schema.String, title }),
  Output: { id: Schema.String },
})

/** The rename form and this mutation share one input, which is what an editor joins. */
export const RenameTodoInput = Schema.Struct({ id: Schema.String, title })
export const RenameTodo = Mutation.make('RenameTodo', {
  Input: RenameTodoInput,
  Output: { id: Schema.String },
})

/**
 * `done` is the value to store, not a flip. A retry of the same request
 * writes the same integer, where `done = 1 - done` would undo itself.
 */
export const ToggleTodo = Mutation.make('ToggleTodo', {
  Input: Schema.Struct({ id: Schema.String, done }),
  Output: { id: Schema.String },
})

export const DeleteTodo = Mutation.make('DeleteTodo', {
  Input: Schema.Struct({ id: Schema.String }),
  Output: {},
})
