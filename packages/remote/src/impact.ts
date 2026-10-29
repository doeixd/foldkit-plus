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
import {
  Query as Relational,
  dependenciesOf,
  type AnyQuery,
  type ExprContext,
  type MemoryOperators,
  type OneRelation,
  type OrderTerm,
} from 'foldkit-entity'
import { defineTaggedUnion } from 'foldkit/schema'
import { edge, hasNext, hasPrevious, isGapped, type Connection } from './connection.js'
import { RowPlace, placeIn, withEdge, withoutEdge } from './placement.js'
import { Data, Match, Option, Schema } from 'effect'
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
  /** The members its Entity's server filters rows by under a rule the client does not run. */
  readonly filtered: ReadonlyArray<string>
}

const kept = Impact.Kept()

/**
 * What a body's paths, exists and paths from the viewer read beyond the
 * fields of the row judged: `own`, the links of that row a path starts from,
 * which a change re-judges for that row alone; `others`, by Entity name, the
 * members they read in other rows, a change to any of which may move any row
 * of the list.
 */
interface Reached {
  readonly own: ReadonlySet<string>
  readonly others: ReadonlyMap<string, ReadonlySet<string>>
}

const reachedBy = new WeakMap<AnyQuery, Reached>()

const reachedOf = (body: AnyQuery): Reached => {
  const known = reachedBy.get(body)
  if (known !== undefined) return known
  const own = new Set<string>()
  const others = new Map<string, Set<string>>()
  const other = (entity: string, key: string) => {
    const keys = others.get(entity) ?? new Set<string>()
    keys.add(key)
    others.set(entity, keys)
  }
  /** Relations followed from the judged row: the first is its own link, the rest other rows'. */
  const fromRow = (via: ReadonlyArray<OneRelation>) =>
    via.forEach((relation, index) =>
      index === 0 ? own.add(relation.key) : other(relation.owner.name, relation.key),
    )
  for (const reach of Relational.dependencies(body).reaches)
    Match.value(reach).pipe(
      Match.tagsExhaustive({
        Path: path => {
          fromRow(path.via)
          other(path.field.owner.name, path.field.key)
        },
        Exists: exists => {
          fromRow(exists.via)
          other(exists.relation.owner.name, exists.relation.key)
          Option.map(exists.where, where =>
            dependenciesOf(where).fields.forEach(field => other(field.entity, field.key)),
          )
        },
        ViewerPath: path => {
          for (const relation of path.via) other(relation.owner.name, relation.key)
          other(path.field.owner.name, path.field.key)
        },
      }),
    )
  const reached = { own, others }
  reachedBy.set(body, reached)
  return reached
}

/** Whether two versions of a list hold the same rows in the same order, segment by segment. */
const sameOrder = (left: Connection, right: Connection): boolean =>
  left.segments.length === right.segments.length &&
  left.segments.every((segment, index) => {
    const other = right.segments[index]!.edges
    return (
      segment.edges.length === other.length &&
      segment.edges.every((edge, position) => edge.key === other[position]!.key)
    )
  })

/**
 * What `change` does to `connection`, judged against `store`, the store after
 * the write.
 */
export const impactOn = (
  connection: HeldConnection,
  store: EntityStore,
  change: EntityChange,
  operators: MemoryOperators,
  /** What a body's `Expr.viewer` and `Expr.now` read; see `MatchingOptions.context`. */
  context?: ExprContext | undefined,
): Impact => {
  const { descriptor } = connection
  const body = descriptor.body
  const over = body?.entity.name ?? (descriptor.Result as Partial<ConnectionSpec>).entity
  const reached = body === undefined ? undefined : reachedOf(body)
  // A row another reads through a path or an exists: any row of the list may have moved.
  const read = reached?.others.get(change.entity)
  if (
    read !== undefined &&
    EntityChange.match(change, {
      Deleted: () => true,
      Changed: ({ fields }) => fields.some(field => read.has(field)),
    })
  ) {
    return Impact.Invalidated({
      reason: `${entityKey(change.entity, change.id)} changed what "${descriptor.name}" reads through another row`,
    })
  }
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
      // The server lists only the rows its read rules admit, and the client
      // runs none of them: a row this list does not hold may have joined it
      // on a change to what those rules read, which only the server can say.
      const ruled = fields.find(field => connection.filtered.includes(field))
      if (!held && ruled !== undefined) {
        return Impact.Invalidated({
          reason: `${key} changed "${ruled}", which the server's read rule for ${change.entity} filters on`,
        })
      }
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
      const refilters =
        touches(roles.predicate) || fields.some(field => reached?.own.has(field) === true)
      // A row the list does not hold can join it: one new to the client,
      // whatever the list filters on, and one whose order moved it in from
      // rows the list has not loaded.
      const unloaded = hasPrevious(pages) || hasNext(pages) || isGapped(pages)
      const joins = !held && (created || (reorders && unloaded))
      if (!(held && reorders) && !refilters && !joins) return kept

      // A held row whose order alone changed still matches.
      const belongs =
        held && !refilters
          ? 'yes'
          : belongsEncoded(store, descriptor, connection.encoded, key, operators, context)
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
      /** The row where `place` says; the list as it was when that is where it already stood. */
      const placedAt = (place: Extract<RowPlace, { readonly _tag: 'Before' | 'End' }>) => {
        const next = withEdge(
          withoutEdge(pages, key),
          edge({ entity: change.entity, id: change.id }),
          place,
        )
        return sameOrder(pages, next) ? kept : Impact.Placed({ connection: next })
      }
      return RowPlace.$match(placeIn(store, pages, body, connection.encoded, key, operators), {
        Before: placedAt,
        End: placedAt,
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
