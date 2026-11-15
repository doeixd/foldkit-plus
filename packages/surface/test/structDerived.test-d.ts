/**
 * A `Derived` in `Projection.struct`. Type-checked but not executed.
 */
import { Schema } from 'effect'
import { Projection } from '../src/index.js'
import { App } from './todoFixture.js'

const count = Projection.derive([App.model.todos], root => root.todos.length, {
  Model: Schema.Number,
})
const board = Projection.struct({ count, selected: App.model.selectedTodoId })
const _count: number = board.read({ todos: [], selectedTodoId: null }).count
const _selected: string | null = board.read({ todos: [], selectedTodoId: null }).selected

// @ts-expect-error the value is a number, not a string
const _wrong: string = board.read({ todos: [], selectedTodoId: null }).count

// @ts-expect-error a Derived with no Model has no Schema for a Surface to check
Projection.struct({ bare: Projection.derive([App.model.todos], root => root.todos.length) })

// @ts-expect-error the Model must describe the derived value
Projection.derive([App.model.todos], root => root.todos.length, { Model: Schema.String })

// @ts-expect-error read takes the application's Model
board.read({ route: '/' })
