/**
 * The reasons `Data.why` reads out of the Model: what it holds about each list
 * and each row a read reads, and what pending writes show of them (#248).
 */
import { Array as Arr, Option } from 'effect'
import {
  Expr,
  Judge,
  type AnyQuery,
  type ExprContext,
  type MemoryOperators,
  type Row,
} from 'foldkit-entity'
import type { Edge } from './connection.js'
import { holderOf } from './held.js'
import { fieldMark, isQueryLoading, type RemoteModel } from './model.js'
import type { EntityLayer } from './optimistic.js'
import { targetsOf } from './relation.js'
import { RemoteData, type RemoteError } from './remoteData.js'
import type { ConnectionRequirement, RelationRequirement, Requirement } from './requirement.js'
import { entityKey, type EntityStore } from './store.js'
import { ShownBy, Why, type ListRef, type WhyTerm } from './why.js'

/** What a read asks of the store: entity requirements and list connections. */
export interface Asked {
  readonly requirements: ReadonlyArray<Requirement>
  readonly connections: ReadonlyArray<ConnectionRequirement>
}

/** What the reasons are read from, as the bound domain reads its lists. */
export interface WhyReader {
  readonly remote: RemoteModel
  /** The store as reads see it: the server's under every pending layer. */
  readonly visible: EntityStore
  readonly listOf: (identity: string) => ListRef
  /** The list's body and its encoded input, when its query was declared with one. */
  readonly bodyOf: (
    identity: string,
  ) => Option.Option<{ readonly body: AnyQuery; readonly encoded: Row }>
  /**
   * The rows the read shows (`shown`, cut to its window), every row the list
   * shows (`placed`), and the server's pages (`pages`).
   */
  readonly edgesOf: (connection: ConnectionRequirement) => {
    readonly shown: ReadonlyArray<Edge>
    readonly placed: ReadonlyArray<Edge>
    readonly pages: ReadonlyArray<Edge>
  }
  readonly operators: MemoryOperators
  /** What a body's `Expr.viewer` reads: the viewer the newest pending operation was predicted for. */
  readonly context: ExprContext | undefined
}

/** What an optimistic id names: a request, an overlay, or a live event. */
const sourceOf = (remote: RemoteModel, id: string): ShownBy => {
  if (id.startsWith('overlay:')) return ShownBy.Overlay({ id: id.slice('overlay:'.length) })
  if (id.startsWith('live:')) return ShownBy.Live({ cursor: id.slice('live:'.length) })
  return ShownBy.Write({
    requestId: id,
    mutation: Option.fromUndefinedOr(remote.mutations.writes.get(id)?.mutation),
  })
}

const touches = (layer: EntityLayer, entity: string, id: string): boolean =>
  layer.patches.some(patch => patch.entity === entity && patch.id === id) ||
  layer.deletes.some(gone => gone.entity === entity && gone.id === id)

/** The newest layer that writes or deletes the row, as the source shown. */
const writerOf = (remote: RemoteModel, entity: string, id: string): Option.Option<ShownBy> =>
  Option.map(
    Arr.findLast(remote.optimistic.layers, layer => touches(layer, entity, id)),
    layer => sourceOf(remote, layer.id),
  )

/** Fields grouped by whether a read of each is in flight. */
const byFlight = (
  remote: RemoteModel,
  entity: string,
  id: string,
  fields: ReadonlyArray<string>,
): ReadonlyArray<readonly [boolean, ReadonlyArray<string>]> => {
  const flying: string[] = []
  const resting: string[] = []
  for (const field of fields) {
    ;(remote.loading.has(fieldMark(entity, id, field)) ? flying : resting).push(field)
  }
  return [
    [true, flying],
    [false, resting],
  ] as const
}

/** The reasons for one row the read reads, and for each row its relations reach. */
const rowReasons = (
  reader: WhyReader,
  entity: string,
  id: string,
  relation: RelationRequirement,
  via: ReadonlyArray<string>,
  walked: Map<string, Set<RelationRequirement>>,
): ReadonlyArray<Why> => {
  const { remote, visible } = reader
  const key = entityKey(entity, id)
  const seen = walked.get(key) ?? new Set()
  // Once per row and requirement, as the read assembles it; a cycle ends.
  if (seen.has(relation)) return []
  seen.add(relation)
  walked.set(key, seen)
  const row = { entity, id }
  const entry = visible[key]
  if (entry?.tombstone === true) return [Why.Deleted({ row, by: writerOf(remote, entity, id) })]

  const reasons: Why[] = []
  const failed = new Map<RemoteError, string[]>()
  for (const field of relation.fields) {
    const error = remote.failures.fields[fieldMark(entity, id, field)]
    if (error !== undefined) failed.set(error, [...(failed.get(error) ?? []), field])
  }
  for (const [error, fields] of failed) reasons.push(Why.FieldsFailed({ row, via, fields, error }))

  const unavailable = relation.fields.filter(field => entry?.unavailable.has(field) === true)
  if (unavailable.length > 0) reasons.push(Why.Unavailable({ row, via, fields: unavailable }))

  const missing = relation.fields.filter(
    field => entry === undefined || (!entry.present.has(field) && !entry.unavailable.has(field)),
  )
  // A row the store lacks whole because the budget evicted it says so.
  const absent = entry === undefined && remote.evicted.rows.includes(key) ? 'Evicted' : 'Missing'
  const stale = relation.fields.filter(
    field => entry !== undefined && entry.present.has(field) && entry.stale.has(field),
  )
  for (const [held, fields] of [
    [absent, missing],
    ['Stale', stale],
  ] as const) {
    for (const [inFlight, part] of byFlight(remote, entity, id, fields)) {
      if (part.length > 0) reasons.push(Why.Fields({ row, via, fields: part, held, inFlight }))
    }
  }

  for (const layer of remote.optimistic.layers) {
    const written = new Set(
      layer.patches
        .filter(patch => patch.entity === entity && patch.id === id)
        .flatMap(patch => [
          ...Object.keys(patch.values),
          ...Object.keys(patch.adds ?? {}),
          ...Object.keys(patch.computes ?? {}),
        ]),
    )
    const fields = relation.fields.filter(field => written.has(field))
    if (fields.length > 0)
      reasons.push(Why.Pending({ row, fields, by: sourceOf(remote, layer.id) }))
  }

  for (const [field, nested] of Object.entries(relation.relations ?? {})) {
    if (entry === undefined || !entry.present.has(field)) continue
    for (const target of targetsOf(entry.values[field], nested)) {
      reasons.push(...rowReasons(reader, target.entity, target.id, nested, [...via, field], walked))
    }
  }
  return reasons
}

const truths: Readonly<Record<'true' | 'false' | 'unknown', WhyTerm['truth']>> = {
  true: 'True',
  false: 'False',
  unknown: 'Null',
}

/** Each `where` predicate of the list's body, judged over the row as the client holds it. */
const termsOf = (reader: WhyReader, identity: string, entity: string, id: string) =>
  Option.match(reader.bodyOf(identity), {
    onNone: (): ReadonlyArray<WhyTerm> => [],
    onSome: ({ body, encoded }) => {
      const holder = holderOf(reader.visible)
      return Option.match(holder.rows.row(body.entity, id), {
        onNone: (): ReadonlyArray<WhyTerm> =>
          body.where.map(predicate => ({
            term: Expr.show(predicate),
            truth: 'Unknown',
            reason: Option.some(`${entity} ${id} is not held`),
          })),
        onSome: held =>
          body.where.map(predicate =>
            Judge.match(
              Judge.predicate(predicate, held, {
                input: encoded,
                operators: reader.operators,
                context: reader.context,
                rows: holder.rows,
              }),
              {
                onKnown: (truth): WhyTerm => ({
                  term: Expr.show(predicate),
                  truth: truths[`${truth}`],
                  reason: Option.none(),
                }),
                onUnknown: (reason): WhyTerm => ({
                  term: Expr.show(predicate),
                  truth: 'Unknown',
                  reason: Option.some(reason),
                }),
              },
            ),
          ),
      })
    },
  })

/** The overlay that shows or hides this edge in this list, newest first. */
const overlayOf = (
  remote: RemoteModel,
  identity: string,
  key: string,
  removes: boolean,
): Option.Option<ShownBy> =>
  Option.map(
    Arr.findLast(
      remote.optimistic.overlays,
      overlay =>
        overlay.connection === identity &&
        (overlay.position === 'remove') === removes &&
        overlay.edges.some(edge => edge.key === key),
    ),
    overlay => sourceOf(remote, overlay.id),
  )

const listReasons = (reader: WhyReader, asked: ConnectionRequirement): ReadonlyArray<Why> => {
  const { remote } = reader
  const { identity } = asked
  const list = reader.listOf(identity)
  const connection = remote.connections[identity]
  const failure = remote.failures.connections[identity]
  const inFlight = isQueryLoading(remote, identity)
  const reasons: Why[] = failure === undefined ? [] : [Why.ListFailed({ list, error: failure })]
  // A stale list with no pages has nothing to show: it is missing, as the read reads it.
  if (connection === undefined || (connection.stale && connection.segments.length === 0)) {
    const held =
      connection === undefined && remote.evicted.connections.includes(identity)
        ? 'Evicted'
        : 'Missing'
    return [...reasons, Why.List({ list, held, inFlight })]
  }
  if (connection.stale) reasons.push(Why.List({ list, held: 'Stale', inFlight }))
  const { shown, placed, pages } = reader.edgesOf(asked)
  const walked = new Map<string, Set<RelationRequirement>>()
  for (const edge of shown) {
    if (edge.ref.entity !== asked.select.entity) continue
    reasons.push(...rowReasons(reader, edge.ref.entity, edge.ref.id, asked.select, [], walked))
  }
  const served = new Set(pages.map(edge => edge.key))
  const shows = new Set(placed.map(edge => edge.key))
  for (const edge of shown) {
    if (served.has(edge.key)) continue
    reasons.push(
      Why.Joined({
        list,
        row: { entity: edge.ref.entity, id: edge.ref.id },
        by: Option.orElse(overlayOf(remote, identity, edge.key, false), () =>
          writerOf(remote, edge.ref.entity, edge.ref.id),
        ),
        terms: termsOf(reader, identity, edge.ref.entity, edge.ref.id),
      }),
    )
  }
  for (const edge of pages) {
    if (shows.has(edge.key)) continue
    reasons.push(
      Why.Left({
        list,
        row: { entity: edge.ref.entity, id: edge.ref.id },
        by: Option.orElse(overlayOf(remote, identity, edge.key, true), () =>
          writerOf(remote, edge.ref.entity, edge.ref.id),
        ),
        terms: termsOf(reader, identity, edge.ref.entity, edge.ref.id),
      }),
    )
  }
  return reasons
}

/** Every fact the Model holds about what a read asks: its lists first, then its rows. */
export const reasonsOf = (reader: WhyReader, asked: Asked): ReadonlyArray<Why> => {
  const walked = new Map<string, Set<RelationRequirement>>()
  return [
    ...asked.connections.flatMap(connection => listReasons(reader, connection)),
    ...asked.requirements.flatMap(requirement =>
      rowReasons(reader, requirement.entity, requirement.id, requirement, [], walked),
    ),
  ]
}

/** The reasons a `Failed` state carries in its error alone: values the store holds that cannot be shown. */
export const failedReasons = (data: RemoteData<unknown>): ReadonlyArray<Why> =>
  RemoteData.match(data, {
    Initial: () => [],
    Loading: () => [],
    Ready: () => [],
    Refreshing: () => [],
    NotFound: () => [],
    Failed: error => {
      // tag-check: open — a `RemoteError`'s tag is open; these two are the store's own.
      switch (error._tag) {
        case 'DecodeError':
          return [Why.Undecodable({ message: error.message })]
        case 'Overlaid':
          return [Why.OverlayOnly({ message: error.message })]
        default:
          return []
      }
    },
  })
