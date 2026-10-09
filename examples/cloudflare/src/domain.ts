/**
 * The todo, declared once. This module imports neither Remote nor Drizzle:
 * the page and the worker both read what it says.
 *
 * `done` is 0 or 1 because the column is an integer. A boolean is a different
 * kind, and the binding refuses it.
 */
import { Schema } from 'effect'
import { Entity } from 'foldkit-entity'

const TodoEntity = Entity.define(
  'Todo',
  Schema.Struct({
    id: Schema.String,
    title: Schema.String.check(Schema.isMinLength(1)).annotate({ title: 'Title' }),
    done: Schema.Literals([0, 1]),
  }),
)

export const Domain = Entity.relate({ Todo: TodoEntity }, { Todo: {} })
export const Todo = Domain.Todo

/** One row of the list: the id, the title, and whether it is done. */
export const TodoRow = Entity.select(Todo, { id: true, title: true, done: true })
