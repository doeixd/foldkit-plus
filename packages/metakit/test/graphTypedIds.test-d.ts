import { expectTypeOf } from 'vitest'
import { build, knownEdge, modelPath, type DependencyGraph } from '../src/graph.js'

const graph = build({
  writers: [
    {
      id: 'AddTodo',
      kind: 'transition',
      writes: [knownEdge(modelPath(['todos']))],
    },
    {
      id: 'SetFilter',
      kind: 'transition',
      writes: [knownEdge(modelPath(['filter']))],
    },
  ],
  readers: [
    {
      id: 'TodoList',
      kind: 'projection',
      reads: [knownEdge(modelPath(['todos']))],
    },
    {
      id: 'FilterBar',
      kind: 'projection',
      reads: [knownEdge(modelPath(['filter']))],
    },
  ],
})

expectTypeOf(graph).toEqualTypeOf<
  DependencyGraph<'AddTodo' | 'SetFilter', 'TodoList' | 'FilterBar'>
>()

const affected = graph.affectedBy('AddTodo')
expectTypeOf(affected).toEqualTypeOf<ReadonlyArray<'TodoList' | 'FilterBar'>>()

const readers = graph.readersOf(modelPath(['todos']))
expectTypeOf(readers).toEqualTypeOf<ReadonlyArray<'TodoList' | 'FilterBar'>>()

const writers = graph.writersOf(modelPath(['todos']))
expectTypeOf(writers).toEqualTypeOf<ReadonlyArray<'AddTodo' | 'SetFilter'>>()

graph.explain('AddTodo', 'TodoList')

// @ts-expect-error 'Typo' is not a declared writer id
graph.affectedBy('Typo')

// @ts-expect-error 'NoSuchSurface' is not a declared reader id
graph.explain('AddTodo', 'NoSuchSurface')
