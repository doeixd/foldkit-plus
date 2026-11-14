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
expectTypeOf<
  'law-unwitnessed' | 'evidence-unmatched' | 'level-declared-twice' | 'transition-declared-twice'
>().toExtend<Finding['rule']>()

const _contract: Contract = {
  kind: 'sync',
  name: 'todos',
  owns: [],
  observes: [],
  messages: [],
  metadata: [],
  laws: { model: ['few'] },
}

// @ts-expect-error a path names its space: a Model field or an Entity member
GraphEdge.Writes({ transition: 'durable:Added', path: ['todos'] })

// @ts-expect-error a local Message's transition waits on foldkit/foldkit#1655
GraphNode.Transition({ id: 'message:Added', kind: 'message' })

// @ts-expect-error a space is a Model field or an Entity member, nothing else
GraphEdge.Reads({ law: 'sync:todos.few', space: 'row', path: ['todos'] })

const _derived: Contract = {
  ..._contract,
  // @ts-expect-error a contract declares its laws; the graph derives their nodes and edges
  laws: { nodes: [], edges: [] },
}

// @ts-expect-error evidence is a list of records, not one
Module.validate(Plain, { evidence: record })
