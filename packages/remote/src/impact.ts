/**
 * What a write did to the lists the client holds: given one change and one
 * loaded connection, whether the connection is still right as it stands.
 *
 * Pure, and asked once per connection a write could touch. The answer is never
 * a guess: a connection kept must be provably unchanged in which rows it holds
 * and in what order, a connection placed is the client's exact deduction of
 * what the server now lists, and everything else is invalidated, with the
 * reason, for the read entry to fetch again.
 *
 * Membership is judged by the query's body, as a live insert is
 * (`belongsEncoded`), and position by its declared order (`placeIn`), when
 * the order is placeable. A body that names no order leaves it to the server,
 * by fields the client cannot see, so any change to a row it holds
 * invalidates it.
 */
import { Query as Relational, dependenciesOf, type OrderTerm } from 'foldkit-entity'
import { defineTaggedUnion } from 'foldkit/schema'
import { edge, hasNext, hasPrevious, isGapped, type Connection } from './connection.js'
import { RowPlace, placeIn, withEdge, withoutEdge } from './placement.js'
import { Data, Schema } from 'effect'
import { sameData } from './data.js'
import { belongsEncoded } from './matching.js'
import type { NormalizedPatch } from './mutation.js'
import type { ConnectionSpec, QueryDescriptor } from './query.js'
import { entityKey, type EntityKey, type EntityStore } from './store.js'

/**
 * One row a write changed: the fields it wrote, and whether the client held
 * no values of the row before (`created`), or its deletion.
 */
export const EntityChange = defineTaggedUnion({
  Changed: {
    entity: Schema.String,
    id: Schema.String,
    fields: Schema.Array(Schema.String),
    created: Schema.Boolean,
  },
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
      : [
          EntityChange.Changed({
            entity: patch.entity,
            id: patch.id,
            fields,
            created: held === undefined,
          }),
        ]
  }),
  ...(answer.deleted ?? []).map(gone => EntityChange.Deleted({ entity: gone.entity, id: gone.id })),
]

/**
 * What a change does to a connection: nothing it shows, a change the client
 * places itself (`Placed`, the connection as it now is), or a change it
 * cannot place, for its read entry to fetch again.
 */
export type Impact = Data.TaggedEnum<{
  Kept: {}
  Placed: { readonly connection: Connection }
  Invalidated: { readonly reason: string }
}>
export const Impact = Data.taggedEnum<Impact>()

/** A loaded connection, as impact needs it. */
export interface HeldConnection {
  readonly descriptor: QueryDescriptor<string, unknown, unknown>
  /** The connection's input, encoded, as its identity carries it. */
  readonly encoded: Readonly<Record<string, unknown>>
  /** The rows it shows now, overlays included. */
  readonly holds: ReadonlySet<EntityKey>
  /** Its pages as the server sent them, which a placement edits. */
  readonly connection: Connection
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
    Changed: ({ fields, created }) => {
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
      // The order this list was read in: a chosen order is the field its own
      // input names, not every field it could have named.
      let order: ReadonlyArray<OrderTerm>
      try {
        order = Relational.orderFor(body, connection.encoded)
      } catch {
        return Impact.Invalidated({
          reason: `"${descriptor.name}" was read in an order its body does not offer`,
        })
      }

      if (held && body.orderBy.length === 0) {
        return Impact.Invalidated({
          reason: `${key} changed, and "${descriptor.name}" is ordered by the server, by fields its body does not name`,
        })
      }
      const pages = connection.connection
      const reorders = touches(dependenciesOf(...order).fields)
      const refilters = touches(roles.predicate)
      // A row the list does not hold can join it: one new to the client,
      // whatever the list filters on, and one whose order moved it in from
      // rows the list has not loaded.
      const unloaded = hasPrevious(pages) || hasNext(pages) || isGapped(pages)
      const joins = !held && (created || (reorders && unloaded))
      if (!(held && reorders) && !refilters && !joins) return kept

      // A held row whose order alone changed still matches.
      const belongs =
        held && !refilters ? 'yes' : belongsEncoded(store, descriptor, connection.encoded, key)
      if (belongs === 'unknown') {
        return Impact.Invalidated({
          reason: `${key} changed a field "${descriptor.name}" filters on, and the client cannot judge it`,
        })
      }
      // Not held and still not matching, or held and still matching where it was.
      if (!held && belongs === 'no') return kept
      if (held && belongs === 'yes' && !reorders) return kept

      // The list's rows, or their order, changed: placed where the client can.
      const inPages = pages.segments.some(segment => segment.edges.some(edge => edge.key === key))
      if (held && !inPages) {
        return Impact.Invalidated({
          reason: `${key} is shown in "${descriptor.name}" by an overlay, which a placement does not move`,
        })
      }
      // Leaving is exact whatever the order: membership is the body's.
      if (belongs === 'no') return Impact.Placed({ connection: withoutEdge(pages, key) })
      return RowPlace.$match(placeIn(store, pages, body, connection.encoded, key), {
        Before: place =>
          Impact.Placed({
            connection: withEdge(
              withoutEdge(pages, key),
              edge({ entity: change.entity, id: change.id }),
              place,
            ),
          }),
        End: place =>
          Impact.Placed({
            connection: withEdge(
              withoutEdge(pages, key),
              edge({ entity: change.entity, id: change.id }),
              place,
            ),
          }),
        // It belongs to rows not loaded: gone from these, if they showed it.
        Outside: () => (held ? Impact.Placed({ connection: withoutEdge(pages, key) }) : kept),
        Unknown: ({ reason }) =>
          Impact.Invalidated({
            reason: `${key} ${held ? 'moved in' : 'joined'} "${descriptor.name}", and cannot be placed: ${reason}`,
          }),
      })
    },
  })
}
