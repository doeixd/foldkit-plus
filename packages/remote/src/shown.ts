/**
 * What a client shows of each entity, sent with a mutation so its answer
 * carries those fields (#245). Per entity rather than per row: the server
 * knows which rows a write changed, the client what it reads of a row of
 * each kind.
 */
import type { PendingPatch } from './ledger.js'
import type { OptimisticOperation } from './optimistic.js'
import { Requirement, type ConnectionRequirement, type RelationRequirement } from './requirement.js'

/** A patch is the one optimistic operation with no tag. */
export const isPatch = (operation: OptimisticOperation): operation is PendingPatch =>
  !('_tag' in operation)

/** Every field a pending patch shows: those it sets, adds to, and computes. */
export const patchedFields = (patch: PendingPatch): ReadonlyArray<string> => [
  ...Object.keys(patch.values),
  ...Object.keys(patch.adds ?? {}),
  ...Object.keys(patch.computes ?? {}),
]

/**
 * The union, per entity, of every slice the reads ask: each requirement's,
 * each connection's item `select`, and every relation's target slice under
 * its own entity too, so a row the answer names is read the way any read
 * reaches it. Every field the write's own patches show is added: the
 * prediction is released when the answer lands, so a field it moved that no
 * Surface reads now (a count on a page left behind) would otherwise read the
 * value from before the write (#265). `foreseen` adds the members the
 * written row foresees, foreseen or not (`foreseenOfWrite`, #370).
 */
export const shownOf = (
  asked: {
    readonly requirements: ReadonlyArray<Requirement>
    readonly connections: ReadonlyArray<ConnectionRequirement>
  },
  predicted: ReadonlyArray<OptimisticOperation>,
  foreseen: ReadonlyArray<RelationRequirement>,
): ReadonlyArray<RelationRequirement> => {
  const byEntity = new Map<string, RelationRequirement>()
  const add = (slice: RelationRequirement): void => {
    // A merge keeps a slice's own keys only, so a requirement's `id` and `live` stay behind.
    const current = byEntity.get(slice.entity) ?? { entity: slice.entity, fields: [] }
    byEntity.set(slice.entity, Requirement.mergeRelation(current, slice))
    for (const relation of Object.values(slice.relations ?? {})) add(relation)
  }
  for (const requirement of asked.requirements) add(requirement)
  for (const connection of asked.connections) add(connection.select)
  for (const patch of predicted.filter(isPatch))
    add({ entity: patch.entity, fields: [...patchedFields(patch)] })
  for (const slice of foreseen) add(slice)
  return [...byEntity.values()]
}
