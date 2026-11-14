/**
 * A declared write's facts for `Module.graph` (#537), read off the write and
 * nothing more: its transition (`write:Sell`) and the members it writes, a law
 * per invariant of its Entity and the members each reads, the Entity's
 * declared states, and the write's declared `from` and `becomes`.
 *
 * `Mutation.write` holds the function, and a domain's contract joins each of
 * its mutations', so this module is in a page only when the page declares a
 * write. No enumeration runs: whether a write keeps a law is evidence, which
 * `Laws.check`'s `Enumerated` records, a walk's and a scenario's give
 * `Module.validate`.
 */
import { Option } from 'effect'
import { Entity, Footprint, Write, lawId, transitionId, type AnyWrite } from 'foldkit-entity'
import { GraphEdge, GraphNode, type GraphFacts } from 'foldkit-surface'

export const writeFacts = (name: string, write: AnyWrite): GraphFacts => {
  const entity = write.input.entity
  const transition = transitionId({ name })
  const member = (key: string) => ({ space: 'entity' as const, path: [entity.name, key] })
  const written = Footprint.$match(Write.footprint(write), {
    Derived: ({ writes }) => writes,
    Declared: ({ writes }) => writes,
    Unknown: () => Object.keys(entity.fields),
  })
  const laws = Entity.invariants(entity).map(held => ({ id: lawId(held), held }))
  return {
    nodes: [
      GraphNode.Transition({ id: transition, kind: 'write' }),
      ...laws.map(({ id }) => GraphNode.Law({ id })),
      ...Entity.states(entity).map(state =>
        GraphNode.State({ entity: entity.name, name: state.name }),
      ),
    ],
    edges: [
      ...written.map(key => GraphEdge.Writes({ transition, ...member(key) })),
      ...laws.flatMap(({ id, held }) =>
        [...new Set([...held.before, ...held.after])].map(key =>
          GraphEdge.Reads({ law: id, ...member(key) }),
        ),
      ),
      ...Option.toArray(write.from).map(state =>
        GraphEdge.From({ transition, entity: entity.name, state: state.name }),
      ),
      ...Option.toArray(write.becomes).map(state =>
        GraphEdge.To({ transition, entity: entity.name, state: state.name }),
      ),
    ],
  }
}
