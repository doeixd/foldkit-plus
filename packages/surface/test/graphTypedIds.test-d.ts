import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { expectTypeOf } from 'vitest'
import { Module, Projection, Surface } from '../src/index.js'
import { Graph, type GraphReaderId, type GraphWriterId } from '../src/graph.js'

const Model = Schema.Struct({
  todos: Schema.Array(Schema.String),
  filter: Schema.String,
})

const Message = defineMessageUnion({
  AddTodo: { title: Schema.String },
  SetFilter: { filter: Schema.String },
})

const App = Surface.application({ Model, Message })

const TodoList = Surface.make(App, 'TodoList', {
  model: ({ model }) => Projection.struct({ todos: model.todos }),
  messages: [Message.AddTodo],
})

const FilterBar = App.surface('FilterBar', {
  model: ({ model }) => ({ filter: model.filter }),
  messages: [Message.SetFilter],
})

const AppModule = Module.make(App, [TodoList, FilterBar])
const graph = Graph.of(AppModule)

expectTypeOf(graph.dependencies.affectedBy('message:AddTodo')).toEqualTypeOf<
  ReadonlyArray<GraphReaderId<'TodoList' | 'FilterBar'>>
>()
expectTypeOf(graph.dependencies.writersOf({ kind: 'model', segments: ['todos'] })).toEqualTypeOf<
  ReadonlyArray<GraphWriterId<'AddTodo' | 'SetFilter'>>
>()

graph.dependencies.explain('message:AddTodo', 'surface:TodoList')
graph.dependencies.explain('durable:AddTodo', 'closure:TodoList')

// @ts-expect-error 'Typo' is not a declared writer id
graph.dependencies.affectedBy('Typo')

// @ts-expect-error 'message:Typo' is not a declared Message tag
graph.dependencies.affectedBy('message:Typo')

// @ts-expect-error 'NoSuchSurface' is not a declared reader id
graph.dependencies.explain('AddTodo', 'NoSuchSurface')

// @ts-expect-error 'surface:NoSuchSurface' is not a declared Surface name
graph.dependencies.explain('message:AddTodo', 'surface:NoSuchSurface')
