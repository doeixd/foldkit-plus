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
import type { Connection } from './connection.js'
import { readField, type EntityStore } from './store.js'

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

/** The values a row holds of the fields an order reads, or the first it lacks. */
const keysOf = (
  store: EntityStore,
  key: string,
  terms: ReadonlyArray<OrderTerm>,
): Option.Option<Readonly<Record<string, unknown>>> => {
  const values: Record<string, unknown> = Object.create(null)
  for (const term of terms) {
    if (term.expr._tag !== 'Field') return Option.none()
    const value = readField(store, key, term.expr.key)
    if (Option.isNone(value)) return Option.none()
    values[term.expr.key] = value.value
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
  const row = keysOf(store, key, terms)
  if (Option.isNone(row)) {
    return RowPlace.Unknown({ reason: `${key} lacks a field the order reads` })
  }
  /** Negative when the row sorts before the edge; none when the edge cannot be compared. */
  const against = (edge: string): Option.Option<number> =>
    Option.flatMap(keysOf(store, edge, terms), values => {
      try {
        return Option.some(compareRows(terms, row.value, values, body.entity.name))
      } catch {
        return Option.none()
      }
    })

  const { segments } = connection
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index]!
    const edges = segment.edges.filter(edge => edge.key !== key)
    for (let position = 0; position < edges.length; position++) {
      const edge = edges[position]!
      const sign = against(edge.key)
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
