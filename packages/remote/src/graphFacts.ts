/**
 * A Remote domain's facts for `Module.graph` (#537), read off its declared
 * writes and nothing more: a transition per mutation with a declared write,
 * the members it writes, a law per invariant of each Entity a write writes and
 * the members it reads, each such Entity's local states, and each write's
 * declared `from` and `becomes`.
 *
 * No enumeration runs here, so a page with a domain carries no checker:
 * whether a write keeps a law is evidence, which `Laws.check`'s `Enumerated`
 * records, a walk's and a scenario's give `Module.validate`.
 */
import { Option } from 'effect'
import {
  Entity,
  Footprint,
  Write,
  lawId,
  transitionId,
  type AnyEntity,
  type AnyWrite,
} from 'foldkit-entity'
import { GraphEdge, GraphNode, type GraphFacts } from 'foldkit-surface'

export const domainFacts = (
  mutations: ReadonlyArray<{ readonly name: string; readonly write?: AnyWrite | undefined }>,
): GraphFacts => {
  const nodes: Array<GraphNode> = []
  const edges: Array<GraphEdge> = []
  const entities: Array<AnyEntity> = []
  const member = (entity: AnyEntity, key: string) => ({
    space: 'entity' as const,
    path: [entity.name, key],
  })
  for (const { name, write } of mutations) {
    if (write === undefined) continue
    const entity = write.input.entity
    if (!entities.some(known => known.identity === entity.identity)) entities.push(entity)
    const transition = transitionId({ name })
    nodes.push(GraphNode.Transition({ id: transition, kind: 'write' }))
    const written = Footprint.$match(Write.footprint(write), {
      Derived: ({ writes }) => writes,
      Declared: ({ writes }) => writes,
      Unknown: () => Object.keys(entity.fields),
    })
    for (const key of written) edges.push(GraphEdge.Writes({ transition, ...member(entity, key) }))
    for (const state of Option.toArray(write.from))
      edges.push(GraphEdge.From({ transition, entity: entity.name, state: state.name }))
    for (const state of Option.toArray(write.becomes))
      edges.push(GraphEdge.To({ transition, entity: entity.name, state: state.name }))
  }
  for (const entity of entities) {
    for (const held of Entity.invariants(entity)) {
      const law = lawId(held)
      nodes.push(GraphNode.Law({ id: law }))
      for (const key of new Set([...held.before, ...held.after]))
        edges.push(GraphEdge.Reads({ law, ...member(entity, key) }))
    }
    for (const state of Entity.states(entity))
      if (state.local) nodes.push(GraphNode.State({ entity: entity.name, name: state.name }))
  }
  return { nodes, edges }
}
