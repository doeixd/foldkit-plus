/**
 * Live data applied. Entity facts update the store; connection facts change
 * ordering and membership. Events carry a monotonic cursor ordered **per
 * stream**: duplicates are ignored, and a gap is surfaced so the caller can
 * resume or invalidate. Reached only through the live capability (#378), which
 * a live read installs.
 */
import { Equal, Option } from 'effect'
import { type Connection, hasNext, hasPrevious } from './connection.js'
import { addOverlay } from './capability.js'
import { noKept, type Kept, type KeptField } from './kept.js'
import type { OptimisticState } from './optimistic.js'
import type { LiveInsertion, LivePolicy } from './query.js'
import { own } from './record.js'
import {
  entityKey,
  tombstone,
  writeEntity,
  type EntityEntry,
  type EntityKey,
  type EntityStore,
} from './store.js'
import type { AwaitedEcho, LiveCursor, LiveEvent, LiveOutcome, LiveState } from './liveState.js'

/**
 * Ordering per stream: at most the next cursor; ahead is a gap. A stream opens
 * after the cursor it was given and counts on from it, so one opened from the
 * start (cursor `0`) begins at 1. A stream the ledger dropped reads as cursor
 * `0` too, and its next event, past 1, is a gap that restarts it (#289).
 */
export const classifyLive = (state: LiveState, cursor: LiveCursor): LiveOutcome =>
  cursor <= state.cursor ? 'duplicate' : cursor === state.cursor + 1 ? 'applied' : 'gap'

const noPending: ReadonlySet<string> = new Set()

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

/** Long past any stream's lag behind an answer: it only bounds what the Model keeps (echoes and `kept` alike). */
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

/** `kept` without the fields heard `echoKept` or more before `now`. */
const unexpired = (kept: Kept, now: number): Kept => {
  let next: Map<EntityKey, ReadonlyMap<string, KeptField>> | undefined
  for (const [key, row] of kept) {
    const live = new Map([...row].filter(([, field]) => field.since > now - echoKept))
    if (live.size === row.size) continue
    next ??= new Map(kept)
    if (live.size === 0) next.delete(key)
    else next.set(key, live)
  }
  return next ?? kept
}

const withoutRow = (kept: Kept, key: EntityKey): Kept => {
  if (!kept.has(key)) return kept
  const next = new Map(kept)
  next.delete(key)
  return next
}

/**
 * `kept` once a patch wrote `fields` of a row held as `under`, while the
 * requests in `pending` were in flight: a field's first patch keeps what it
 * held, and every patch adds the requests it was pending beside.
 */
const keptBefore = (
  kept: Kept,
  key: EntityKey,
  under: EntityEntry | undefined,
  fields: ReadonlyArray<string>,
  pending: ReadonlySet<string>,
  now: number,
): Kept => {
  const row = new Map(kept.get(key))
  let changed = false
  for (const field of fields) {
    const held = row.get(field)
    const before =
      under !== undefined && !under.tombstone && under.present.has(field)
        ? Option.some(own(under.values, field))
        : Option.none()
    // A request new to the field began after the patches it already has, so it is
    // worked out over what the base held before this one.
    const fresh = [...pending].filter(id => held === undefined || !held.by.has(id))
    if (fresh.length === 0) continue
    changed = true
    row.set(field, {
      since: held?.since ?? now,
      by: new Map([...(held?.by ?? []), ...fresh.map(id => [id, before] as const)]),
    })
  }
  return changed ? new Map(kept).set(key, row) : kept
}

/**
 * What an answer does to the values kept from before a stream's patches: the
 * fields it writes leave `kept`, and those that a stream patched while the
 * request was pending, to something other than the answer's value, are
 * `again` to be read: the client cannot tell whether the stream is behind the
 * write or past it, and only a read can say (#499). `pending` is the requests
 * still in flight after the answer; with none, nothing is kept.
 */
export const settleKept = (
  kept: Kept,
  store: EntityStore,
  requestId: string,
  entities: ReadonlyArray<{
    readonly entity: string
    readonly id: string
    readonly values: Readonly<Record<string, unknown>>
  }>,
  pending: ReadonlySet<string>,
  now: number,
): { readonly kept: Kept; readonly again: ReadonlyArray<AgainRow> } => {
  const held = unexpired(kept, now)
  const again = againOf(held, store, requestId, entities)
  if (pending.size === 0) return { kept: noKept, again }
  const next = new Map(held)
  for (const { entity, id, values } of entities) {
    const key = entityKey(entity, id)
    const row = next.get(key)
    if (row === undefined) continue
    const rest = new Map([...row].filter(([field]) => !Object.hasOwn(values, field)))
    if (rest.size === 0) next.delete(key)
    else next.set(key, rest)
  }
  return { kept: next, again }
}

export interface AgainRow {
  readonly entity: string
  readonly id: string
  readonly fields: ReadonlyArray<string>
}

const againOf = (
  kept: Kept,
  store: EntityStore,
  requestId: string,
  entities: ReadonlyArray<{
    readonly entity: string
    readonly id: string
    readonly values: Readonly<Record<string, unknown>>
  }>,
): ReadonlyArray<AgainRow> => {
  const again = new Map<EntityKey, { entity: string; id: string; fields: Set<string> }>()
  for (const { entity, id, values } of entities) {
    const key = entityKey(entity, id)
    const row = kept.get(key)
    if (row === undefined) continue
    for (const [field, held] of row) {
      if (!held.by.has(requestId) || !Object.hasOwn(values, field)) continue
      if (Equal.equals(own(store[key]?.values, field), values[field])) continue
      const asked = again.get(key) ?? { entity, id, fields: new Set<string>() }
      asked.fields.add(field)
      again.set(key, asked)
    }
  }
  return [...again.values()].map(({ entity, id, fields }) => ({ entity, id, fields: [...fields] }))
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
  readonly kept: Kept
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
    /** What fields held before a patch landed while a write was pending (`settleKept`). */
    readonly kept?: Kept | undefined
    /** The requests in flight, which a patch is kept beside. */
    readonly pending?: ReadonlySet<string> | undefined
  } = {},
): EntityApplied => {
  const echoes = context.echoes ?? {}
  const kept = context.kept ?? noKept
  const outcome = classifyLive(state, event.cursor)
  if (outcome !== 'applied')
    return { state, store, outcome, written: {}, echoes, kept, contradicted: [] }
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
      kept: withoutRow(kept, key),
      contradicted: [],
    }
  }
  const heard =
    awaited === undefined ? undefined : heardBack(awaited, context.stream ?? '', event.values)
  const written = heard?.values ?? event.values
  const unexpiredKept = unexpired(kept, context.now ?? 0)
  return {
    state: next,
    store: writeEntity(store, key, written, context.now ?? 0),
    outcome,
    written,
    echoes:
      heard === undefined || heard.echo === awaited ? echoes : { ...echoes, [key]: heard.echo },
    kept: keptBefore(
      unexpiredKept,
      key,
      store[key],
      Object.keys(written),
      context.pending ?? noPending,
      context.now ?? 0,
    ),
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
