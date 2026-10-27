/**
 * What a client shows of each entity, sent with a mutation so its answer
 * carries those fields (#245). Per entity rather than per row: the server
 * knows which rows a write changed, the client what it reads of a row of
 * each kind.
 */
import { Requirement, type ConnectionRequirement, type RelationRequirement } from './requirement.js'

/**
 * The union, per entity, of every slice the reads ask: each requirement's,
 * each connection's item `select`, and every relation's target slice under
 * its own entity too, so a row the answer names is read the way any read
 * reaches it.
 */
export const shownOf = (asked: {
  readonly requirements: ReadonlyArray<Requirement>
  readonly connections: ReadonlyArray<ConnectionRequirement>
}): ReadonlyArray<RelationRequirement> => {
  const byEntity = new Map<string, RelationRequirement>()
  const add = (slice: RelationRequirement): void => {
    // A merge keeps a slice's own keys only, so a requirement's `id` and `live` stay behind.
    const current = byEntity.get(slice.entity) ?? { entity: slice.entity, fields: [] }
    byEntity.set(slice.entity, Requirement.mergeRelation(current, slice))
    for (const relation of Object.values(slice.relations ?? {})) add(relation)
  }
  for (const requirement of asked.requirements) add(requirement)
  for (const connection of asked.connections) add(connection.select)
  return [...byEntity.values()]
}
