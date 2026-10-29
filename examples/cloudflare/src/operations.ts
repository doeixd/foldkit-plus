/**
 * What the page may ask of the server. The list is one query. Every write is
 * declared: what it changes is data, so the page shows it before the server
 * answers, and the server's writer lands it with no handler. Create's id is the
 * page's, so the row it shows and the row stored are the same one.
 */
import { Schema } from 'effect'
import { Entity, Order, Write } from 'foldkit-entity'
import { Mutation, Query } from 'foldkit-remote'
import { Todo } from './domain.js'

/** Every todo by title, ties by id: the body D1 is asked for, and the client places by. */
export const AllTodos = Query.define('AllTodos', {}, () =>
  Query.from(Todo).pipe(Query.orderBy(Order.asc(Todo.fields.title))),
)

/** The page and the live list watch share this window, so neither can drift. */
export const TODO_PAGE_SIZE = 100

const title = Todo.fields.title.schema
const done = Todo.fields.done.schema

/** A new todo is not done: the form has a title only, and the page mints the id. */
export const CreateTodo = Mutation.write(
  'CreateTodo',
  Write.insert(
    Entity.input(Todo, Schema.Struct({ id: Schema.String, title, done: Schema.Literal(0) })),
    { id: 'id' },
  ),
)

/**
 * The rename form and this mutation share one input, which is what an editor
 * joins. Both are declared writes: what they change is data, so the page shows
 * it before the server answers and the server writes it with no handler.
 */
export const RenameTodoInput = Schema.Struct({ id: Schema.String, title })
export const RenameTodo = Mutation.write(
  'RenameTodo',
  Write.update(Entity.input(Todo, RenameTodoInput), { id: 'id' }),
)

/**
 * `done` is the value to store, not a flip. A retry of the same request
 * writes the same integer, where `done = 1 - done` would undo itself.
 */
export const ToggleTodo = Mutation.write(
  'ToggleTodo',
  Write.update(Entity.input(Todo, Schema.Struct({ id: Schema.String, done })), { id: 'id' }),
)

/** Shown deleted from every list at once; a row already gone is gone. */
export const DeleteTodo = Mutation.write(
  'DeleteTodo',
  Write.delete(Entity.input(Todo, Schema.Struct({ id: Schema.String })), { id: 'id' }),
)
