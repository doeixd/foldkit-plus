/**
 * The two forms. Adding takes a title; the page supplies the id. Renaming
 * takes the id and the title, and that value is the rename mutation's input.
 */
import { Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { Form, Input } from 'foldkit-form'
import { Todo } from './domain.js'
import { RenameTodoInput } from './operations.js'

export const AddTodoForm = Form.make(
  'AddTodo',
  Entity.input(
    Todo,
    Schema.Struct({
      title: Todo.fields.title.schema.annotate({ title: 'New todo' }),
    }),
  ),
)

export const RenameTodoForm = Form.make('RenameTodo', Entity.input(Todo, RenameTodoInput), {
  inputs: { id: Input.hidden() },
})
