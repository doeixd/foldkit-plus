/**
 * `Projection.derive` inference contract. Type-checked but not executed.
 */
import { Schema } from 'effect'
import { Projection, Surface } from '../src/index.js'
import { App } from './todoFixture.js'

// The root is inferred from the references; `derive` needs no annotation.
const titles = Projection.derive([App.model.todos], root => root.todos.map(todo => todo.title))
const _titles: ReadonlyArray<string> = titles.read({ todos: [], selectedTodoId: null })

// @ts-expect-error the derivation reads a field the application's Model does not have
Projection.derive([App.model.todos], root => root.missing)

// @ts-expect-error a derived value is read from the application's Model
titles.read({ route: '/' })

const Other = Surface.application({
  Model: Schema.Struct({ route: Schema.String }),
  Message: App.Message,
})
// @ts-expect-error references from two applications share no root
Projection.derive([App.model.todos, Other.model.route], root => root)
