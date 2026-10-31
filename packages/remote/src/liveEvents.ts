/**
 * Live data applied. Entity facts update the store; connection facts change
 * ordering and membership. Events carry a monotonic cursor ordered **per
 * stream**: duplicates are ignored, and a gap is surfaced so the caller can
 * resume or invalidate. Reached only through the live capability (#378), which
 * a live read installs.
 */
import type { EdgeRef } from './connection.js'
import { type Connection, type Edge, hasNext, hasPrevious } from './connection.js'
import { addOverlay } from './capability.js'
import type { OptimisticState } from './optimistic.js'
import type { LiveInsertion, LivePolicy } from './query.js'
import { entityKey, tombstone, writeEntity, type EntityStore } from './store.js'
import type { LiveCursor, LiveEvent, LiveOutcome, LiveState } from './liveState.js'

/**
 * Ordering per stream: at most the next cursor; ahead is a gap. A stream opens
 * after the cursor it was given and counts on from it, so one opened from the
 * start (cursor `0`) begins at 1. A stream the ledger dropped reads as cursor
 * `0` too, and its next event, past 1, is a gap that restarts it (#289).
 */
export const classifyLive = (state: LiveState, cursor: LiveCursor): LiveOutcome =>
  cursor <= state.cursor ? 'duplicate' : cursor === state.cursor + 1 ? 'applied' : 'gap'

const advance = (state: LiveState, cursor: LiveCursor): LiveState => ({ ...state, cursor })

const recordBoundary = (
  state: LiveState,
  connection: string,
  position: 'prepend' | 'append',
): LiveState => {
  const current = state.boundary[connection] ?? { before: 0, after: 0 }
  const next =
    position === 'prepend'
      ? { ...current, before: current.before + 1 }
      : { ...current, after: current.after + 1 }
  return { ...state, boundary: { ...state.boundary, [connection]: next } }
}

export interface EntityApplied {
  readonly state: LiveState
  readonly store: EntityStore
  readonly outcome: LiveOutcome
}

export const applyEntityEvent = (
  state: LiveState,
  store: EntityStore,
  event: Extract<LiveEvent, { _tag: 'EntityPatched' | 'EntityDeleted' }>,
  now = 0,
): EntityApplied => {
  const outcome = classifyLive(state, event.cursor)
  if (outcome !== 'applied') return { state, store, outcome }
  const key = entityKey(event.ref.entity, event.ref.id)
  const next =
    event._tag === 'EntityPatched'
      ? writeEntity(store, key, event.values, now)
      : tombstone(store, key)
  return { state: advance(state, event.cursor), store: next, outcome }
}

export interface ConnectionApplied {
  readonly state: LiveState
  readonly optimistic: OptimisticState
  readonly outcome: LiveOutcome
  /**
   * A connection the event says to refetch. Reported rather than recorded here,
   * because staleness lives on the connection in the Model — which is what the
   * planner and every read consult. It used to be written into a set on this
   * live state that nothing read, so an invalidating event did nothing at all.
   */
  readonly invalidated?: string | undefined
}

const removeEdgeOverlays = (
  optimistic: OptimisticState,
  connection: string,
  key: string,
): OptimisticState => ({
  ...optimistic,
  overlays: optimistic.overlays.map(overlay => {
    if (overlay.connection !== connection || overlay.position === 'remove') return overlay
    const edges = overlay.edges.filter(edge => edge.key !== key)
    return edges.length === overlay.edges.length ? overlay : { ...overlay, edges }
  }),
})

export const applyConnectionEvent = (
  state: LiveState,
  optimistic: OptimisticState,
  event: Extract<
    LiveEvent,
    { _tag: 'ConnectionInsert' | 'ConnectionRemove' | 'ConnectionInvalidate' }
  >,
  policy: LivePolicy = {},
): ConnectionApplied => {
  const outcome = classifyLive(state, event.cursor)
  if (outcome !== 'applied') return { state, optimistic, outcome }

  switch (event._tag) {
    case 'ConnectionInsert': {
      const selection: LiveInsertion =
        (event.position === 'prepend' ? policy.prepend : policy.append) ?? 'visible'
      switch (selection) {
        case 'visible':
          return {
            state: advance(state, event.cursor),
            optimistic: addOverlay(optimistic, {
              id: `live:${event.cursor}`,
              connection: event.connection,
              edges: [event.edge],
              position: event.position,
            }),
            outcome,
          }
        case 'boundary':
          return {
            state: recordBoundary(advance(state, event.cursor), event.connection, event.position),
            optimistic,
            outcome,
          }
        case 'invalidate':
          return {
            state: advance(state, event.cursor),
            optimistic,
            outcome,
            invalidated: event.connection,
          }
        case 'ignore':
          return { state: advance(state, event.cursor), optimistic, outcome }
      }
    }
    case 'ConnectionRemove':
      // Strip the edge from pending inserts and hide it wherever else it is
      // (a server-known segment included) until a fresh page says otherwise.
      return {
        state: advance(state, event.cursor),
        optimistic: addOverlay(removeEdgeOverlays(optimistic, event.connection, event.edge.key), {
          id: `live:${event.cursor}`,
          connection: event.connection,
          edges: [event.edge],
          position: 'remove',
        }),
        outcome,
      }
    case 'ConnectionInvalidate':
      return {
        state: advance(state, event.cursor),
        invalidated: event.connection,
        optimistic,
        outcome,
      }
  }
}

/** `hasPrevious` accounting for edges recorded outside the loaded boundary. */
export const liveHasPrevious = (
  connection: Connection,
  state: LiveState,
  connectionId: string,
): boolean => hasPrevious(connection) || (state.boundary[connectionId]?.before ?? 0) > 0

/** `hasNext` accounting for edges recorded outside the loaded boundary. */
export const liveHasNext = (
  connection: Connection,
  state: LiveState,
  connectionId: string,
): boolean => hasNext(connection) || (state.boundary[connectionId]?.after ?? 0) > 0
