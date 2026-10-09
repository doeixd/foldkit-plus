/**
 * What a write did to the lists the client holds: given one change and one
 * loaded connection, whether the connection is still right as it stands.
 *
 * Pure, and asked once per connection a write could touch. The answer is never
 * a guess: a connection kept must be provably unchanged in which rows it holds
 * and in what order, and everything else is invalidated, with the reason, for
 * the read entry to fetch again. Proving a local update insufficient is an
 * answer too.
 *
 * Membership is judged by the query's body, as a live insert is
 * (`belongsEncoded`). Position is never judged here: where a row sorts needs
 * the backend's collation, so a change to an ordering field of a row the list
 * holds invalidates it.
 */
import { Query as Relational } from 'foldkit-entity'
import { defineTaggedUnion } from 'foldkit/schema'
import { Schema } from 'effect'
import { sameData } from './data.js'
import { belongsEncoded } from './matching.js'
import type { NormalizedPatch } from './mutation.js'
import type { ConnectionSpec, QueryDescriptor } from './query.js'
import { entityKey, type EntityKey, type EntityStore } from './store.js'

/** One row a write changed: the fields it wrote, or its deletion. */
export const EntityChange = defineTaggedUnion({
  Changed: { entity: Schema.String, id: Schema.String, fields: Schema.Array(Schema.String) },
  Deleted: { entity: Schema.String, id: Schema.String },
})
export type EntityChange = typeof EntityChange.Type

/**
 * What a mutation's answer changed, against `before`, the store as the server
 * last said it: each patch's fields whose value is new, and each deletion. An
 * answer returns more than it changed (a whole row, say), and counting an
 * unchanged ordering field would refetch every list on every save.
 */
export const changesOf = (
  answer: {
    readonly entities: ReadonlyArray<NormalizedPatch>
    readonly deleted?: ReadonlyArray<{ readonly entity: string; readonly id: string }> | undefined
  },
  before: EntityStore,
): ReadonlyArray<EntityChange> => [
  ...answer.entities.flatMap(patch => {
    const held = before[entityKey(patch.entity, patch.id)]?.values
    const fields = Object.keys(patch.values).filter(
      field =>
        held === undefined ||
        !Object.hasOwn(held, field) ||
        !sameData(held[field], patch.values[field]),
    )
    return fields.length === 0
      ? []
      : [EntityChange.Changed({ entity: patch.entity, id: patch.id, fields })]
  }),
  ...(answer.deleted ?? []).map(gone => EntityChange.Deleted({ entity: gone.entity, id: gone.id })),
]

/** Whether a connection stands as it is after a change, or must be fetched again. */
export const Impact = defineTaggedUnion({
  Kept: {},
  Invalidated: { reason: Schema.String },
})
export type Impact = typeof Impact.Type

/** A loaded connection, as impact needs it. */
export interface HeldConnection {
  readonly descriptor: QueryDescriptor<string, unknown, unknown>
  /** The connection's input, encoded, as its identity carries it. */
  readonly encoded: Readonly<Record<string, unknown>>
  /** The rows it holds now. */
  readonly holds: ReadonlySet<EntityKey>
}

const kept = Impact.Kept()

/**
 * What `change` does to `connection`, judged against `store`, the store after
 * the write.
 */
export const impactOn = (
  connection: HeldConnection,
  store: EntityStore,
  change: EntityChange,
): Impact => {
  const { descriptor } = connection
  const body = descriptor.body
  const over = body?.entity.name ?? (descriptor.Result as Partial<ConnectionSpec>).entity
  if (over !== change.entity) return kept
  return EntityChange.match(change, {
    // A deletion leaves every list through its tombstone; nothing to fetch.
    Deleted: () => kept,
    Changed: ({ fields }) => {
      if (body === undefined) {
        return Impact.Invalidated({
          reason: `query "${descriptor.name}" declares no body, so what it reads is unknown`,
        })
      }
      const key = entityKey(change.entity, change.id)
      const held = connection.holds.has(key)
      const roles = Relational.dependencies(body)
      const touches = (keys: ReadonlyArray<{ readonly key: string }>) =>
        keys.some(field => fields.includes(field.key))

      if (held && touches(roles.order)) {
        return Impact.Invalidated({
          reason: `${key} changed a field "${descriptor.name}" is ordered by`,
        })
      }
      if (!touches(roles.predicate)) return kept

      const belongs = belongsEncoded(store, descriptor, connection.encoded, key)
      if (belongs === 'unknown') {
        return Impact.Invalidated({
          reason: `${key} changed a field "${descriptor.name}" filters on, and the client cannot judge it`,
        })
      }
      // Held and still matching, or not held and still not matching: the same rows.
      if (held === (belongs === 'yes')) return kept
      return Impact.Invalidated({
        reason: `${key} ${held ? 'no longer matches' : 'now matches'} "${descriptor.name}"`,
      })
    },
  })
}
