import { expectTypeOf } from 'vitest'
import type { LawEdge, LawEntry, LawFacts, LawNode } from 'foldkit-entity'
import type { Contract, GraphEdge, GraphFacts, GraphNode } from 'foldkit-surface'

// `Laws.facts` and `lawFactsOf` return the graph's own shape, which the graph takes as it is.
expectTypeOf<LawFacts>().toExtend<GraphFacts>()
expectTypeOf<LawNode>().toExtend<GraphNode>()
expectTypeOf<LawEdge>().toExtend<GraphEdge>()
// A contract declares any entry `Laws.check` takes: a declared write, or a transition known
// by its footprint (an imported command's).
expectTypeOf<ReadonlyArray<LawEntry>>().toExtend<
  NonNullable<NonNullable<Contract['laws']>['entities']>
>()
