import { expectTypeOf } from 'vitest'
import type { LawEdge, LawFacts, LawNode } from 'foldkit-entity'
import type { Contract, GraphEdge, GraphFacts, GraphNode } from 'foldkit-surface'

// `Laws.facts` returns the graph's own shape, so a contract over transitions
// that are no declared writes (an imported command's footprint) contributes it as it is.
expectTypeOf<LawFacts>().toExtend<GraphFacts>()
expectTypeOf<LawNode>().toExtend<GraphNode>()
expectTypeOf<LawEdge>().toExtend<GraphEdge>()
expectTypeOf<() => LawFacts>().toExtend<NonNullable<Contract['facts']>>()
