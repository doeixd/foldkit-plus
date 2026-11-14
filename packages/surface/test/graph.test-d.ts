import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { expectTypeOf } from 'vitest'
import {
  Evidence,
  Graph,
  GraphEdge,
  GraphNode,
  Module,
  Surface,
  type Breaker,
  type Contract,
  type Finding,
  type GraphFacts,
} from '../src/index.js'

const App = Surface.application({
  Model: Schema.Struct({ todos: Schema.Array(Schema.String) }),
  Message: defineMessageUnion({ Added: { title: Schema.String } }),
})
const Plain = Module.make(App, [])

// The second parameter is optional: every call made before the graph stands.
expectTypeOf(Module.validate(Plain)).toEqualTypeOf<readonly Finding[]>()
expectTypeOf(Module.toMarkdown(Plain)).toEqualTypeOf<string>()
const record = Evidence.runtimeOnly({
  transition: 'durable:Added',
  law: 'sync:todos.few',
  why: 'x',
})
expectTypeOf(Module.validate(Plain, { evidence: [record] })).toEqualTypeOf<readonly Finding[]>()
expectTypeOf(Graph.breakersOf(Module.graph(Plain), 'sync:todos.few')).toEqualTypeOf<
  ReadonlyArray<Breaker>
>()
expectTypeOf<'law-unwitnessed' | 'evidence-unmatched' | 'level-declared-twice'>().toExtend<
  Finding['rule']
>()

const facts: GraphFacts = {
  nodes: [GraphNode.Transition({ id: 'durable:Added', kind: 'durable' })],
  edges: [GraphEdge.Writes({ transition: 'durable:Added', space: 'model', path: ['todos'] })],
}
const _contract: Contract = {
  kind: 'sync',
  name: 'todos',
  owns: [],
  observes: [],
  messages: [],
  metadata: [],
  facts: () => facts,
}

// @ts-expect-error a path names its space: a Model field or an Entity member
GraphEdge.Writes({ transition: 'durable:Added', path: ['todos'] })

// @ts-expect-error a local Message's transition waits on foldkit/foldkit#1655
GraphNode.Transition({ id: 'message:Added', kind: 'message' })

// @ts-expect-error a space is a Model field or an Entity member, nothing else
GraphEdge.Reads({ law: 'sync:todos.few', space: 'row', path: ['todos'] })

const _late: Contract = {
  ..._contract,
  // @ts-expect-error facts are computed when asked: a function, not the data
  facts,
}

// @ts-expect-error evidence is a list of records, not one
Module.validate(Plain, { evidence: record })
