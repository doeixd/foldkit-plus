/**
 * Where one row falls in a loaded list, by the list's own declared order:
 * the decidable half of placing a row instead of fetching the list again.
 *
 * A list is segments of edges between boundaries, and only a `Terminal`
 * boundary says nothing lies beyond it. So a row is placed between two loaded
 * edges, or before a segment's first edge when that segment starts the list,
 * or at its end when it ends it; a row that sorts past a `Cursor` or into a
 * gap belongs to rows the client has not read, and is `Outside`. Anything the
 * client cannot judge exactly (a body it cannot place, a field a row lacks,
 * keys it cannot compare) is `Unknown`, with why, never a guess.
 *
 * Pure: it reads the store and the list it is given.
 */
import { Data, Match, Option } from 'effect'
import { Query as Relational, compareRows, type AnyQuery, type OrderTerm } from 'foldkit-entity'
import type { Connection, Edge } from './connection.js'
import { entityKey, readField, type EntityStore } from './store.js'

/** Where a row falls in a loaded list. */
export type RowPlace = Data.TaggedEnum<{
  /** Just before this edge, in this segment. */
  Before: { readonly segment: number; readonly edge: string }
  /** After every edge of this segment, which ends the list. */
  End: { readonly segment: number }
  /** In rows the list has not loaded: past a `Cursor` boundary, or in a gap. */
  Outside: {}
  /** Not judged exactly, and why. */
  Unknown: { readonly reason: string }
}>
export const RowPlace = Data.taggedEnum<RowPlace>()

/**
 * The values a row holds of the fields an order reads, or none when it lacks
 * one. Its `id` is its key's, whether or not a Selection stored it, so the
 * id tie-break every order ends on never makes a row unplaceable.
 */
const keysOf = (
  store: EntityStore,
  key: string,
  id: Option.Option<string>,
  terms: ReadonlyArray<OrderTerm>,
): Option.Option<Readonly<Record<string, unknown>>> => {
  const values: Record<string, unknown> = Object.create(null)
  for (const term of terms) {
    if (term.expr._tag !== 'Field') return Option.none()
    const field = term.expr.key
    const value = field === 'id' && Option.isSome(id) ? id : readField(store, key, field)
    if (Option.isNone(value)) return Option.none()
    values[field] = value.value
  }
  return Option.some(values)
}

/**
 * Where the row stored under `key` falls in `connection`, by `body`'s order
 * for `input` (encoded, as a connection's identity carries it). The row's own
 * edge, if the list holds it, is left out: placing a row that moved asks
 * where it goes now.
 */
export const placeIn = (
  store: EntityStore,
  connection: Connection,
  body: AnyQuery,
  input: Readonly<Record<string, unknown>>,
  key: string,
): RowPlace => {
  const placement = Relational.placement(body, input)
  if (placement._tag === 'NotPlaceable') return RowPlace.Unknown({ reason: placement.reason })
  const terms = Relational.orderFor(body, input)
  // The row is of the body's Entity, so its key is that name, a colon, its id.
  const prefix = `${body.entity.name}:`
  const id = key.startsWith(prefix) ? Option.some(key.slice(prefix.length)) : Option.none()
  const row = keysOf(store, key, id, terms)
  if (Option.isNone(row)) {
    return RowPlace.Unknown({ reason: `${key} lacks a field the order reads` })
  }
  /** Negative when the row sorts before the edge; none when the edge cannot be compared. */
  const against = (edge: Edge): Option.Option<number> =>
    Option.flatMap(
      keysOf(store, entityKey(edge.ref.entity, edge.ref.id), Option.some(edge.ref.id), terms),
      values => {
        try {
          return Option.some(compareRows(terms, row.value, values, body.entity.name))
        } catch {
          return Option.none()
        }
      },
    )

  const { segments } = connection
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index]!
    const edges = segment.edges.filter(edge => edge.key !== key)
    for (let position = 0; position < edges.length; position++) {
      const edge = edges[position]!
      const sign = against(edge)
      if (Option.isNone(sign)) {
        return RowPlace.Unknown({ reason: `${edge.key} lacks a field the order reads` })
      }
      if (sign.value < 0) {
        const before = RowPlace.Before({ segment: index, edge: edge.key })
        if (position > 0) return before
        // Before this segment's first edge is loaded only when nothing precedes it.
        return Match.value(segment.start).pipe(
          Match.tag('Terminal', () => before),
          Match.orElse(() => RowPlace.Outside()),
        )
      }
    }
    // After every edge of this segment: its end, if nothing follows; else the
    // next segment, or rows not loaded.
    const ends = Match.value(segment.end).pipe(
      Match.tag('Terminal', () => true),
      Match.orElse(() => false),
    )
    if (ends) return RowPlace.End({ segment: index })
  }
  return RowPlace.Outside()
}

/** The connection without the edge of `key`, or the connection itself when it holds none. */
export const withoutEdge = (connection: Connection, key: string): Connection =>
  connection.segments.some(segment => segment.edges.some(edge => edge.key === key))
    ? {
        ...connection,
        segments: connection.segments.map(segment => ({
          ...segment,
          edges: segment.edges.filter(edge => edge.key !== key),
        })),
      }
    : connection

/** The connection with `edge` where `place` says: before an edge, or at a segment's end. */
export const withEdge = (
  connection: Connection,
  added: Edge,
  place: Extract<RowPlace, { readonly _tag: 'Before' | 'End' }>,
): Connection => ({
  ...connection,
  segments: connection.segments.map((segment, index) => {
    if (index !== place.segment) return segment
    const at = Match.value(place).pipe(
      Match.tagsExhaustive({
        Before: ({ edge }) => segment.edges.findIndex(held => held.key === edge),
        End: () => segment.edges.length,
      }),
    )
    return { ...segment, edges: [...segment.edges.slice(0, at), added, ...segment.edges.slice(at)] }
  }),
})
