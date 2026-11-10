/**
 * Live data applied. Entity facts update the store; connection facts change
 * ordering and membership. Events carry a monotonic cursor ordered **per
 * stream**: duplicates are ignored, and a gap is surfaced so the caller can
 * resume or invalidate. Reached only through the live capability (#378), which
 * a live read installs.
 */
import { Equal } from 'effect'
import { type Connection, hasNext, hasPrevious } from './connection.js'
import { addOverlay } from './capability.js'
import type { OptimisticState } from './optimistic.js'
import type { LiveInsertion, LivePolicy } from './query.js'
import { entityKey, tombstone, writeEntity, type EntityKey, type EntityStore } from './store.js'
import type { AwaitedEcho, LiveCursor, LiveEvent, LiveOutcome, LiveState } from './liveState.js'

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

/** Long past any stream's lag behind an answer: it only bounds what the Model keeps. */
const echoKept = 60_000

/**
 * The echoes awaited once a write's answer wrote `entities` at `now`: each row's
 * values, over what an earlier answer left of it, heard by no stream yet.
 * Waits older than `echoKept` are dropped.
 */
export const awaitEchoes = (
  echoes: Readonly<Record<EntityKey, AwaitedEcho>>,
  entities: ReadonlyArray<{
    readonly entity: string
    readonly id: string
    readonly values: Readonly<Record<string, unknown>>
  }>,
  now: number,
): Readonly<Record<EntityKey, AwaitedEcho>> => {
  const kept = Object.entries(echoes).filter(([, echo]) => echo.since > now - echoKept)
  if (entities.length === 0 && kept.length === Object.keys(echoes).length) return echoes
  const next: Record<EntityKey, AwaitedEcho> = Object.fromEntries(kept)
  for (const { entity, id, values } of entities) {
    const key = entityKey(entity, id)
    next[key] = { values: { ...next[key]?.values, ...values }, since: now, heard: [] }
  }
  return next
}

/**
 * A live patch on `stream`, read against the answer it may predate. A stream
 * that has not sent the answer's values back may still be sending what was
 * committed before the write: a field it patches to something else is left
 * out, to be read again (`contradicted`), since it is older than the answer,
 * or, from a stream that coalesces, newer than it, and only a read can say.
 * A patch that agrees on every awaited field it names is the echo: the stream
 * is caught up.
 */
const heardBack = (
  echo: AwaitedEcho,
  stream: string,
  values: Readonly<Record<string, unknown>>,
): {
  readonly values: Readonly<Record<string, unknown>>
  readonly contradicted: ReadonlyArray<string>
  readonly echo: AwaitedEcho
} => {
  if (echo.heard.includes(stream)) return { values, contradicted: [], echo }
  const named = Object.keys(values).filter(field => Object.hasOwn(echo.values, field))
  const contradicted = named.filter(field => !Equal.equals(values[field], echo.values[field]))
  if (contradicted.length === 0)
    return {
      values,
      contradicted,
      echo: named.length === 0 ? echo : { ...echo, heard: [...echo.heard, stream] },
    }
  const out = new Set(contradicted)
  return {
    values: Object.fromEntries(Object.entries(values).filter(([field]) => !out.has(field))),
    contradicted,
    echo,
  }
}

export interface EntityApplied {
  readonly state: LiveState
  readonly store: EntityStore
  readonly outcome: LiveOutcome
  /** What the patch wrote: its values without those it `contradicted`. */
  readonly written: Readonly<Record<string, unknown>>
  readonly echoes: Readonly<Record<EntityKey, AwaitedEcho>>
  /** Fields the patch set to other than an answer its stream has not sent back: to read again. */
  readonly contradicted: ReadonlyArray<string>
}

export const applyEntityEvent = (
  state: LiveState,
  store: EntityStore,
  event: Extract<LiveEvent, { _tag: 'EntityPatched' | 'EntityDeleted' }>,
  context: {
    readonly now?: number | undefined
    /** The stream the event came on, which an answer it has sent back is heard from. */
    readonly stream?: string | undefined
    readonly echoes?: Readonly<Record<EntityKey, AwaitedEcho>> | undefined
  } = {},
): EntityApplied => {
  const echoes = context.echoes ?? {}
  const outcome = classifyLive(state, event.cursor)
  if (outcome !== 'applied') return { state, store, outcome, written: {}, echoes, contradicted: [] }
  const key = entityKey(event.ref.entity, event.ref.id)
  const awaited = echoes[key]
  const next = advance(state, event.cursor)
  if (event._tag === 'EntityDeleted') {
    const { [key]: _deleted, ...rest } = echoes
    return {
      state: next,
      store: tombstone(store, key),
      outcome,
      written: {},
      echoes: awaited === undefined ? echoes : rest,
      contradicted: [],
    }
  }
  const heard =
    awaited === undefined ? undefined : heardBack(awaited, context.stream ?? '', event.values)
  const written = heard?.values ?? event.values
  return {
    state: next,
    store: writeEntity(store, key, written, context.now ?? 0),
    outcome,
    written,
    echoes:
      heard === undefined || heard.echo === awaited ? echoes : { ...echoes, [key]: heard.echo },
    contradicted: heard?.contradicted ?? [],
  }
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
