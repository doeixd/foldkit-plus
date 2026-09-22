/**
 * The Remote submodel: the store, connections, mutations, live state, and
 * optimistic layers an application keeps in its Model, the Messages that
 * change it, and the pure reducer over them.
 */
import { Schema } from 'effect'
import type { RelationRequirement, Requirement } from './requirement.js'
import {
  emptyConnection,
  merge,
  unknown as unknownBoundary,
  type Connection,
  type Edge,
  type Segment,
} from './connection.js'
import {
  beginOptimistic,
  emptyOptimistic,
  pruneOverlays,
  settleFailure,
  settleSuccess,
  type ConnectionChange,
  type OptimisticState,
  type OptimisticOperation,
} from './optimistic.js'
import {
  applyConnectionEvent,
  applyEntityEvent,
  emptyLiveState,
  type LiveEvent,
  type LiveState,
} from './live.js'
import {
  beginMutation,
  emptyMutationState,
  failMutation,
  type MutationState,
  type NormalizedPatch,
} from './mutation.js'
import {
  entityKey,
  emptyStore,
  isTombstone,
  readField,
  remove,
  setStale,
  tombstone,
  writeEntities,
  type EntityStore,
  type EntityWrite,
} from './store.js'
import { windowKey } from './plan.js'
import { isRefPage, targetsOf, type RefPageValue } from './relation.js'
import { gc, type Retained, type RetentionRoots } from './retain.js'
import { RemotePersistence, type MergePolicy } from './persistence.js'
import { NormalizedEntity, ReadBatchResult, ReadRequest, RelationRequest } from './wire.js'
import { remoteErrorSchema, type RemoteError } from './remoteData.js'
import type { LivePolicy } from './query.js'

/**
 * The normalized cache as a Foldkit Submodel. `Remote.define` returns a schema
 * and an `update` for this shape; `updateRemote` reconciles every producer.
 */
export interface RemoteModel {
  /** Entity values, presence, staleness, tombstones, and applied windows. */
  readonly entities: EntityStore
  /** Normalized ordered connections, keyed by connection identity. */
  readonly connections: Readonly<Record<string, Connection>>
  /** Optimistic entity layers and connection overlays over the base store. */
  readonly optimistic: OptimisticState
  /** Live cursor and boundary state, keyed by the subscription's stream key. */
  readonly live: Readonly<Record<string, LiveState>>
  /** Mutation pending/applied/failed ledger. */
  readonly mutations: MutationState
  /** Streams whose live cursor fell behind; the caller should resync or refetch. */
  readonly gaps: ReadonlySet<string>
  /**
   * The `entity\0id\0field` marks a read is currently fetching. A field absent
   * from the store reads as `Loading` while its mark is here and `Initial`
   * otherwise, which is what separates "being fetched" from "nothing is
   * fetching this".
   */
  readonly loading: ReadonlySet<string>
  /**
   * `Remote.refresh` generations, held per field rather than for the store as a
   * whole. A read entry restarts when the generation over the fields it plans
   * moves, so a read sent before a refresh of its own fields cannot land after
   * it, and a refresh of one field leaves every other entry's read alone.
   */
  readonly refresh: RefreshState
  /**
   * The reads that failed and have not been settled since, so a read can say
   * `Failed` rather than `Initial`.
   *
   * Without them a read that failed before anything loaded read exactly like
   * one nobody had asked for, and nothing asked again: a read entry restarts
   * only when what it plans changes, and a failure changed nothing. What failed
   * is not planned again on its own either, so a persistent error is not
   * retried every time an unrelated read restarts the entry. `Remote.refresh`
   * is how a view retries.
   */
  readonly failures: Failures
}

/**
 * Failed reads, as the errors they failed with.
 *
 * `connections` is by connection identity, and is settled by a page arriving,
 * an invalidation, or retention dropping the connection. `fields` is by field
 * mark (`entity\0id\0field`, the marks `loading` uses), and is settled by the
 * field being written again, a read of it starting, or retention dropping the
 * entity.
 */
export interface Failures {
  readonly connections: Readonly<Record<string, RemoteError>>
  readonly fields: Readonly<Record<string, RemoteError>>
}

export const noFailures: Failures = { connections: {}, fields: {} }

/**
 * `Remote.refresh` generations, per field mark. `generation` is the last one
 * handed out; `requested` is when each field was last refreshed, and `started`
 * is the generation each field's read last began under. Holding them per field
 * is what keeps one Projection's refresh from restarting every read entry.
 */
export interface RefreshState {
  readonly generation: number
  readonly requested: ReadonlyMap<string, number>
  readonly started: ReadonlyMap<string, number>
}

export const emptyRefresh: RefreshState = {
  generation: 0,
  requested: new Map(),
  started: new Map(),
}

export const initialRemoteModel: RemoteModel = {
  entities: emptyStore,
  connections: {},
  optimistic: emptyOptimistic,
  live: {},
  mutations: emptyMutationState,
  gaps: new Set(),
  loading: new Set(),
  refresh: emptyRefresh,
  failures: noFailures,
}

/** The entity store and the mutation ledger are runtime values, not wire shapes. */
const runtimeSchema = Schema.Unknown

export const remoteModelSchema = (): Schema.Codec<RemoteModel, unknown> =>
  // The runtime fields decode as `unknown`; their types come from `RemoteModel`.
  Schema.Struct({
    entities: runtimeSchema,
    connections: Schema.Record(Schema.String, runtimeSchema),
    optimistic: runtimeSchema,
    live: Schema.Record(Schema.String, runtimeSchema),
    mutations: runtimeSchema,
    gaps: runtimeSchema,
    loading: runtimeSchema,
    refresh: runtimeSchema,
    failures: Schema.Struct({
      connections: Schema.Record(Schema.String, remoteErrorSchema),
      fields: Schema.Record(Schema.String, remoteErrorSchema),
    }),
  }) as unknown as Schema.Codec<RemoteModel, unknown>

/** The submodel's Messages; each reduces to `RemoteModel` through `updateRemote`. */
export type RemoteMessage =
  | {
      readonly _tag: 'ReadReceived'
      readonly requests: readonly Requirement[]
      readonly result: Schema.Schema.Type<typeof ReadBatchResult>
      readonly now: number
    }
  | {
      readonly _tag: 'ReadFailed'
      readonly requests: readonly Requirement[]
      readonly error: RemoteError
      /**
       * The live stream whose subscription broke, when this is that rather
       * than a read. Nothing was being read, so no field failed: the stream is
       * recorded as a gap, since changes after it are missed until the host
       * resubscribes.
       */
      readonly stream?: string | undefined
    }
  /** A refetch of present fields began; they read as `Refreshing` until it lands. */
  | { readonly _tag: 'RefreshStarted'; readonly requests: readonly Requirement[] }
  /** A read began; the fields it asks for that the store lacks read as `Loading`. */
  | {
      readonly _tag: 'ReadStarted'
      readonly requests: readonly Requirement[]
      /** The refresh generation the read was planned under. */
      readonly refresh?: number | undefined
    }
  /**
   * Queries for these connections were sent. One with nothing to show reads
   * `Loading` until its page or its failure arrives, which is what separates
   * "being fetched" from `Initial`, "nothing is fetching this".
   */
  | { readonly _tag: 'QueryStarted'; readonly connections: readonly string[] }
  /** The active Surfaces' roots changed; everything they do not reach is collected. */
  | { readonly _tag: 'RetentionChanged'; readonly roots: RetentionRoots }
  /** A restored snapshot meets the store; runtime state is untouched. */
  | {
      readonly _tag: 'Hydrated'
      readonly entities: EntityStore
      /**
       * The connections a snapshot declared should survive, as their edges.
       * Restored with **unknown** boundaries and marked stale: the rows show
       * at once and the connection is refetched, because a persisted cursor
       * may name server state that is gone.
       */
      readonly connections?:
        Readonly<Record<string, ReadonlyArray<ReadonlyArray<Edge>>>> | undefined
      readonly merge: MergePolicy
    }
  /** A mutation began; its optimistic operations show until it settles. */
  | {
      readonly _tag: 'MutationStarted'
      readonly requestId: string
      readonly optimistic?: ReadonlyArray<OptimisticOperation> | undefined
    }
  | {
      readonly _tag: 'MutationSucceeded'
      readonly requestId: string
      readonly entities: readonly NormalizedPatch[]
      /** Connection changes the server confirmed; they replace the request's own. */
      readonly connections?: ReadonlyArray<ConnectionChange> | undefined
      /** Entities the mutation deleted: tombstoned, which hides them from every connection. */
      readonly deleted?: ReadonlyArray<{ readonly entity: string; readonly id: string }> | undefined
    }
  | { readonly _tag: 'MutationFailed'; readonly requestId: string; readonly error: RemoteError }
  /**
   * Operations shown over the store with no request behind them, until they are
   * lifted: a preview of a change nobody has made. Showing an id again replaces
   * what it showed.
   */
  | {
      readonly _tag: 'OverlayShown'
      readonly id: string
      readonly optimistic: ReadonlyArray<OptimisticOperation>
    }
  | { readonly _tag: 'OverlayLifted'; readonly id: string }
  | {
      readonly _tag: 'LiveReceived'
      readonly stream: string
      readonly event: LiveEvent
      readonly policy?: LivePolicy
      readonly now: number
    }
  | { readonly _tag: 'GapCleared'; readonly stream: string }
  | {
      readonly _tag: 'ConnectionMerged'
      readonly connection: string
      readonly page: Segment
      /** The page answers the connection's refresh, so the merge also clears `stale`. */
      readonly refreshes?: boolean | undefined
    }
  | { readonly _tag: 'ConnectionInvalidated'; readonly connection: string }
  | { readonly _tag: 'ConnectionRefreshed'; readonly connection: string }
  /**
   * A query for the connection failed. Its pages stay as they were, and it
   * reads `Failed` — with them as `previous`, when it has any — until a page
   * arrives, it is invalidated, or retention drops it.
   */
  | { readonly _tag: 'QueryFailed'; readonly connection: string; readonly error: RemoteError }

export const retentionRootsSchema = Schema.Struct({
  requirements: Schema.Array(ReadRequest),
  connections: Schema.Array(
    Schema.Struct({ identity: Schema.String, select: Schema.optional(RelationRequest) }),
  ),
})

/**
 * The Messages' fields by tag, without `_tag`: what `defineMessageUnion` takes,
 * so an application spreads them into its own union (`Remote.messages`).
 */
export const remoteMessageCases = {
  ReadReceived: {
    requests: Schema.Array(ReadRequest),
    result: ReadBatchResult,
    now: Schema.Number,
  },
  ReadFailed: {
    requests: Schema.Array(ReadRequest),
    error: remoteErrorSchema,
    stream: Schema.optional(Schema.String),
  },
  RefreshStarted: { requests: Schema.Array(ReadRequest) },
  ReadStarted: { requests: Schema.Array(ReadRequest), refresh: Schema.optional(Schema.Number) },
  QueryStarted: { connections: Schema.Array(Schema.String) },
  RetentionChanged: { roots: retentionRootsSchema },
  Hydrated: {
    connections: Schema.optional(Schema.Unknown),
    entities: runtimeSchema,
    merge: Schema.Union([Schema.Literal('replace'), Schema.Literal('preserve-existing')]),
  },
  MutationStarted: {
    requestId: Schema.String,
    optimistic: Schema.optional(Schema.Array(Schema.Unknown)),
  },
  MutationSucceeded: {
    requestId: Schema.String,
    entities: Schema.Array(NormalizedEntity),
    connections: Schema.optional(Schema.Array(Schema.Unknown)),
    deleted: Schema.optional(
      Schema.Array(Schema.Struct({ entity: Schema.String, id: Schema.String })),
    ),
  },
  MutationFailed: { requestId: Schema.String, error: remoteErrorSchema },
  OverlayShown: { id: Schema.String, optimistic: Schema.Array(Schema.Unknown) },
  OverlayLifted: { id: Schema.String },
  LiveReceived: {
    stream: Schema.String,
    event: Schema.Unknown,
    policy: Schema.optional(Schema.Unknown),
    now: Schema.Number,
  },
  GapCleared: { stream: Schema.String },
  ConnectionMerged: {
    connection: Schema.String,
    page: Schema.Unknown,
    refreshes: Schema.optional(Schema.Boolean),
  },
  ConnectionInvalidated: { connection: Schema.String },
  ConnectionRefreshed: { connection: Schema.String },
  QueryFailed: { connection: Schema.String, error: remoteErrorSchema },
} satisfies Record<RemoteMessage['_tag'], Schema.Struct.Fields>

export type RemoteMessageTag = RemoteMessage['_tag']

/**
 * A Remote Message as an application's union constructs it from
 * `remoteMessageCases`: the same shape `RemoteMessage` names, with the runtime
 * slots (`entities`, `event`, `page`) typed `unknown` by their schemas.
 */
export type RemoteMessageInput = {
  [Tag in RemoteMessageTag]: { readonly _tag: Tag } & Schema.Struct.Type<
    (typeof remoteMessageCases)[Tag]
  >
}[RemoteMessageTag]

/**
 * Whether a Message is one of Remote's, by tag. Narrows an application's union
 * to its Remote cases, and its complement to the application's own.
 */
export const isRemoteMessage = <M extends { readonly _tag: string }>(
  message: M,
): message is Extract<M, { readonly _tag: RemoteMessageTag }> =>
  Object.hasOwn(remoteMessageCases, message._tag)

export const remoteMessageSchema = Schema.Union(
  Object.entries(remoteMessageCases).map(([tag, fields]) =>
    Schema.Struct({ _tag: Schema.Literal(tag), ...fields }),
  ),
) as unknown as Schema.Schema<RemoteMessage>

/** An overlay's layer, named apart from every request's: a request id is the application's to choose too. */
const overlayLayer = (id: string): string => `overlay:${id}`

const marksOf = (
  requests: ReadonlyArray<Requirement>,
): ReadonlyArray<readonly [string, ReadonlyArray<string>]> =>
  requests.map(request => [entityKey(request.entity, request.id), request.fields] as const)

/**
 * One mark per requested field, `entity\0id\0field`. A read is identified by
 * what it asks for, not by a request id: two reads asking for one field share
 * its mark, so the first answer clears it. Over-clearing shows `Initial` rather
 * than a spinner, which is the safer way to be wrong. The refresh generations
 * below key off the same marks, so "what a read asks for" means one thing.
 */
const fieldMark = (entity: string, id: string, field: string): string =>
  `${entityKey(entity, id)}\u0000${field}`

const fieldMarks = function* (requests: ReadonlyArray<Requirement>): Generator<string> {
  for (const request of requests) {
    for (const field of request.fields) yield fieldMark(request.entity, request.id, field)
  }
}

const withLoading = (
  loading: ReadonlySet<string>,
  requests: ReadonlyArray<Requirement>,
): ReadonlySet<string> => {
  const next = new Set(loading)
  for (const mark of fieldMarks(requests)) next.add(mark)
  return next
}

const withoutLoading = (
  loading: ReadonlySet<string>,
  requests: ReadonlyArray<Requirement>,
): ReadonlySet<string> => {
  if (loading.size === 0) return loading
  const next = new Set(loading)
  for (const mark of fieldMarks(requests)) next.delete(mark)
  return next
}

/**
 * A connection's mark. The leading separator keeps it out of the field marks'
 * space, whatever a connection identity happens to spell.
 */
const connectionPrefix = '\u0000connection\u0000'
const connectionMark = (identity: string): string => `${connectionPrefix}${identity}`

/** Whether a query for this connection is in flight. */
export const isQueryLoading = (model: RemoteModel, identity: string): boolean =>
  model.loading.size !== 0 && model.loading.has(connectionMark(identity))

const withoutQueryLoading = (loading: ReadonlySet<string>, identity: string) => {
  if (!loading.has(connectionMark(identity))) return loading
  const next = new Set(loading)
  next.delete(connectionMark(identity))
  return next
}

/**
 * The in-flight marks of connections the roots still name. A query the entry
 * stopped waiting for — it was restarted or deactivated before an answer came —
 * leaves its mark behind, and a connection released with that mark would read
 * `Loading` forever the next time something asked for it before sending.
 */
const prunedQueryLoading = (
  loading: ReadonlySet<string>,
  roots: RetentionRoots,
): ReadonlySet<string> => {
  const named = new Set(roots.connections.map(root => connectionMark(root.identity)))
  const kept = [...loading].filter(mark => !mark.startsWith(connectionPrefix) || named.has(mark))
  return kept.length === loading.size ? loading : new Set(kept)
}

/**
 * Drops the refresh marks of entities and connections that were collected.
 * Nothing observes a collected entity — the retention roots are the active
 * Surfaces — so no read entry's generation can fall back when its mark goes.
 * Without this the generations would be bounded by how many things the
 * application has ever refreshed rather than by what it currently holds, which
 * for a list refreshed on a timer is the same as not bounded at all.
 */
const prunedRefresh = (refresh: RefreshState, retained: Retained): RefreshState => {
  const live = (mark: string): boolean =>
    mark.startsWith(connectionPrefix)
      ? retained.connections[mark.slice(connectionPrefix.length)] !== undefined
      : retained.entities[mark.slice(0, mark.indexOf('\u0000'))] !== undefined
  const keep = (marks: ReadonlyMap<string, number>): ReadonlyMap<string, number> => {
    const next = new Map<string, number>()
    for (const [mark, generation] of marks) if (live(mark)) next.set(mark, generation)
    return next.size === marks.size ? marks : next
  }
  const requested = keep(refresh.requested)
  const started = keep(refresh.started)
  return requested === refresh.requested && started === refresh.started
    ? refresh
    : { ...refresh, requested, started }
}

/**
 * The generation a read is planned under: the highest any of the fields it
 * reads or connections it runs was refreshed at. A read entry carries this as a
 * dependency, so it restarts when what it observes is refreshed and not when
 * anything else is.
 */
export const refreshedAt = (
  refresh: RefreshState,
  requests: ReadonlyArray<Requirement>,
  connections: ReadonlyArray<string> = [],
): number => {
  let at = 0
  for (const mark of fieldMarks(requests)) at = Math.max(at, refresh.requested.get(mark) ?? 0)
  for (const identity of connections) {
    at = Math.max(at, refresh.requested.get(connectionMark(identity)) ?? 0)
  }
  return at
}

/**
 * Marks every field of `requests` and every connection in `connections`
 * refreshed at the next generation.
 */
export const withRefreshRequested = (
  refresh: RefreshState,
  requests: ReadonlyArray<Requirement>,
  connections: ReadonlyArray<string> = [],
): RefreshState => {
  const generation = refresh.generation + 1
  const requested = new Map(refresh.requested)
  for (const mark of fieldMarks(requests)) requested.set(mark, generation)
  for (const identity of connections) requested.set(connectionMark(identity), generation)
  return { ...refresh, generation, requested }
}

/**
 * Records that a read of `requests` began under `generation`. A read that
 * carries no generation began under none, and leaves the marks as they are.
 */
const withRefreshStarted = (
  refresh: RefreshState,
  requests: ReadonlyArray<Requirement>,
  generation: number | undefined,
): RefreshState => {
  if (generation === undefined || generation === 0) return refresh
  let started: Map<string, number> | undefined
  for (const mark of fieldMarks(requests)) {
    if ((refresh.started.get(mark) ?? 0) >= generation) continue
    started ??= new Map(refresh.started)
    started.set(mark, generation)
  }
  return started === undefined ? refresh : { ...refresh, started }
}

/**
 * Whether one field's read already began under the generation that field was
 * last refreshed at. Such a read is in flight and would otherwise outlive the
 * refresh, so the refresh takes a new generation to restart it even though the
 * field is already stale.
 */
export const refreshIsInFlight = (
  refresh: RefreshState,
  request: Requirement,
  field: string,
): boolean => {
  const mark = fieldMark(request.entity, request.id, field)
  return (refresh.started.get(mark) ?? 0) === (refresh.requested.get(mark) ?? 0)
}

/**
 * Whether a read is fetching any of `fields` for this entity. Consulted only
 * when the store lacks the value, which is what separates `Loading` from
 * `Initial`.
 */
export const isLoading = (
  model: RemoteModel,
  entity: string,
  id: string,
  fields: ReadonlyArray<string>,
): boolean => {
  if (model.loading.size === 0) return false
  return fields.some(field => model.loading.has(fieldMark(entity, id, field)))
}

const setConnectionStale = (
  connections: Readonly<Record<string, Connection>>,
  connection: string,
  stale: boolean,
): Readonly<Record<string, Connection>> => {
  const current = connections[connection] ?? emptyConnection
  return { ...connections, [connection]: { ...current, stale } }
}

const markGap = (model: RemoteModel, stream: string): RemoteModel =>
  model.gaps.has(stream) ? model : { ...model, gaps: new Set([...model.gaps, stream]) }

const clearGap = (model: RemoteModel, stream: string): RemoteModel =>
  model.gaps.has(stream)
    ? { ...model, gaps: new Set([...model.gaps].filter(entry => entry !== stream)) }
    : model

/**
 * The pure reducer all four producers share. A live event that arrives ahead of
 * its cursor is a gap: it is not applied, and the stream is recorded so the host
 * can resubscribe rather than silently miss facts.
 */
export const updateRemote = (model: RemoteModel, message: RemoteMessage): RemoteModel => {
  switch (message._tag) {
    case 'ReadReceived':
      return {
        ...model,
        entities: writeRead(model.entities, message.requests, message.result, message.now),
        loading: withoutLoading(model.loading, message.requests),
        failures: withoutFieldFailures(model.failures, fieldMarks(message.requests)),
      }
    case 'ReadFailed':
      // A broken live stream is not a failed read. Marking its fields failed
      // would take them out of the read entry's plan, and restart it, which is
      // the opposite of what missing changes calls for.
      if (message.stream !== undefined) return markGap(model, message.stream)
      // The read is over. Fields it refreshed read as they did, and every field
      // it asked for carries the error until something settles it.
      return {
        ...model,
        entities: setStale(model.entities, marksOf(message.requests), false),
        loading: withoutLoading(model.loading, message.requests),
        failures: withFieldFailures(model.failures, message.requests, message.error),
      }
    case 'RetentionChanged': {
      const retained = gc(model, message.roots)
      return {
        ...model,
        ...retained,
        refresh: prunedRefresh(model.refresh, retained),
        failures: prunedFailures(model.failures, message.roots, retained.entities),
        loading: prunedQueryLoading(model.loading, message.roots),
      }
    }
    case 'Hydrated': {
      // A restored connection is evidence about its rows and about nothing
      // else. Its boundaries are `Unknown` — not `Terminal`, which would claim
      // there is no more, and not the cursors it had, which the server may no
      // longer honour — and it is stale, so the planner refetches it while the
      // rows it held are already on screen.
      const restored = Object.entries(message.connections ?? {}).map(
        ([identity, segments]) =>
          [
            identity,
            {
              // One segment per saved segment: the gaps between them are what
              // says "these rows do not adjoin", and merging them into one run
              // would invent an adjacency nobody established.
              segments: segments.map(edges => ({
                edges: [...edges],
                start: unknownBoundary,
                end: unknownBoundary,
              })),
              stale: true,
            },
          ] as const,
      )
      return {
        ...model,
        entities: RemotePersistence.mergeStores(model.entities, message.entities, message.merge),
        connections:
          message.merge === 'replace'
            ? { ...model.connections, ...Object.fromEntries(restored) }
            : { ...Object.fromEntries(restored), ...model.connections },
      }
    }
    case 'RefreshStarted': {
      // An entity known to be absent has no field to mark, and nothing plans a
      // read of it again. Asked about again, it is forgotten, so it is.
      const asked = message.requests.reduce(
        (store, request) =>
          isTombstone(store, entityKey(request.entity, request.id))
            ? remove(store, entityKey(request.entity, request.id))
            : store,
        model.entities,
      )
      const entities = setStale(asked, marksOf(message.requests), true)
      // Asking again is also how a failed field is retried, including one that
      // never loaded and so has nothing to mark stale.
      const failures = withoutFieldFailures(model.failures, fieldMarks(message.requests))
      return entities === model.entities && failures === model.failures
        ? model
        : { ...model, entities, failures }
    }
    case 'QueryStarted': {
      const loading = new Set(model.loading)
      for (const identity of message.connections) loading.add(connectionMark(identity))
      return loading.size === model.loading.size ? model : { ...model, loading }
    }
    case 'ReadStarted':
      return {
        ...model,
        loading: withLoading(model.loading, message.requests),
        refresh: withRefreshStarted(model.refresh, message.requests, message.refresh),
      }
    case 'MutationStarted':
      return {
        ...model,
        mutations: beginMutation(model.mutations, message.requestId),
        optimistic: beginOptimistic(model.optimistic, message.requestId, message.optimistic ?? []),
      }
    case 'MutationSucceeded': {
      // Settling is release-the-layer-and-overlays, so overlapping optimistic
      // layers rebase instead of needing inverse patches.
      const settled = settleSuccess(
        model.entities,
        model.optimistic,
        model.mutations,
        message.requestId,
        message.entities,
        message.connections ?? [],
        message.deleted ?? [],
      )
      return {
        ...model,
        entities: settled.store,
        mutations: settled.state,
        optimistic: settled.optimistic,
        failures: withoutFieldFailures(model.failures, [
          ...patchedMarks(message.entities),
          ...(message.deleted ?? []).flatMap(ref =>
            entityFailureMarks(model.failures, entityKey(ref.entity, ref.id)),
          ),
        ]),
      }
    }
    case 'OverlayShown':
      return {
        ...model,
        optimistic: beginOptimistic(
          settleFailure(model.optimistic, overlayLayer(message.id)),
          overlayLayer(message.id),
          message.optimistic,
        ),
      }
    case 'OverlayLifted': {
      const optimistic = settleFailure(model.optimistic, overlayLayer(message.id))
      return optimistic.layers.length === model.optimistic.layers.length &&
        optimistic.overlays.length === model.optimistic.overlays.length
        ? model
        : { ...model, optimistic }
    }
    case 'MutationFailed':
      return {
        ...model,
        mutations: failMutation(model.mutations, message.requestId, message.error),
        optimistic: settleFailure(model.optimistic, message.requestId),
      }
    case 'LiveReceived': {
      const state = model.live[message.stream] ?? emptyLiveState
      if (message.event._tag === 'EntityPatched' || message.event._tag === 'EntityDeleted') {
        const event = message.event
        const applied = applyEntityEvent(state, model.entities, event, message.now)
        if (applied.outcome === 'gap') return markGap(model, message.stream)
        // A value the server sent is newer than any failure to fetch it.
        const settled =
          applied.outcome !== 'applied'
            ? []
            : event._tag === 'EntityPatched'
              ? [...patchedMarks([{ ...event.ref, values: event.values }])]
              : entityFailureMarks(model.failures, entityKey(event.ref.entity, event.ref.id))
        return clearGap(
          {
            ...model,
            entities: applied.store,
            live: { ...model.live, [message.stream]: applied.state },
            failures: withoutFieldFailures(model.failures, settled),
          },
          message.stream,
        )
      }
      const applied = applyConnectionEvent(state, model.optimistic, message.event, message.policy)
      if (applied.outcome === 'gap') return markGap(model, message.stream)
      const next = clearGap(
        {
          ...model,
          optimistic: applied.optimistic,
          live: { ...model.live, [message.stream]: applied.state },
        },
        message.stream,
      )
      // An invalidating event means exactly what `ConnectionInvalidated` means,
      // so it goes through the same reduction rather than a parallel one.
      return applied.invalidated === undefined
        ? next
        : updateRemote(next, { _tag: 'ConnectionInvalidated', connection: applied.invalidated })
    }
    case 'GapCleared':
      return clearGap(model, message.stream)
    case 'ConnectionMerged': {
      const current = model.connections[message.connection] ?? emptyConnection
      const failures = withoutConnectionFailure(model.failures, message.connection)
      const loading = withoutQueryLoading(model.loading, message.connection)
      // The page answering an invalidation is the server's list as it now is, so it
      // replaces the pages: removed and reordered items go, and later pages are paged
      // again. A re-run of a connection that was not invalidated still merges.
      const replaces = message.refreshes === true && current.stale
      const merged = merge(replaces ? emptyConnection : current, message.page)
      return {
        ...model,
        connections: {
          ...model.connections,
          [message.connection]: message.refreshes === true ? { ...merged, stale: false } : merged,
        },
        optimistic: pruneOverlays(
          model.optimistic,
          message.connection,
          new Set(message.page.edges.map(edge => edge.key)),
          model.mutations.pending,
        ),
        failures,
        loading,
      }
    }
    case 'ConnectionInvalidated':
      // Asking again is also how a failed query is retried, so the failure goes
      // with the mark: a connection is never both due and failed.
      if (model.connections[message.connection]?.stale === true) return model
      return {
        ...model,
        connections: setConnectionStale(model.connections, message.connection, true),
        failures: withoutConnectionFailure(model.failures, message.connection),
      }
    case 'QueryFailed':
      // The refresh is over and the pages stay as they were. One the Model never
      // held stays absent from `connections`; the failure is what it now knows.
      return {
        ...model,
        connections:
          message.connection in model.connections
            ? setConnectionStale(model.connections, message.connection, false)
            : model.connections,
        failures: {
          ...model.failures,
          connections: { ...model.failures.connections, [message.connection]: message.error },
        },
        loading: withoutQueryLoading(model.loading, message.connection),
      }
    case 'ConnectionRefreshed':
      return {
        ...model,
        connections: setConnectionStale(model.connections, message.connection, false),
      }
  }
}

/** The failures without one connection's, keeping identity when it had none. */
const withoutConnectionFailure = (failures: Failures, connection: string): Failures => {
  if (!(connection in failures.connections)) return failures
  const { [connection]: _settled, ...connections } = failures.connections
  return { ...failures, connections }
}

/** The failures with every field a read asked for failed with `error`. */
const withFieldFailures = (
  failures: Failures,
  requests: ReadonlyArray<Requirement>,
  error: RemoteError,
): Failures => {
  const fields = { ...failures.fields }
  for (const mark of fieldMarks(requests)) fields[mark] = error
  return { ...failures, fields }
}

/**
 * The failures without the fields `settled` names, keeping identity when none
 * of them had failed, which is nearly always: this runs on every write.
 */
const withoutFieldFailures = (failures: Failures, settled: Iterable<string>): Failures => {
  if (Object.keys(failures.fields).length === 0) return failures
  const marks = [...settled].filter(mark => mark in failures.fields)
  if (marks.length === 0) return failures
  const fields = { ...failures.fields }
  for (const mark of marks) delete fields[mark]
  return { ...failures, fields }
}

/** Every failed field of one entity: what deleting the entity settles. */
const entityFailureMarks = (failures: Failures, key: string): ReadonlyArray<string> =>
  Object.keys(failures.fields).filter(mark => mark.startsWith(`${key}\u0000`))

/** The field marks of written values: each patch settles the fields it carries. */
const patchedMarks = function* (
  patches: ReadonlyArray<{ readonly entity: string; readonly id: string; readonly values: object }>,
): Generator<string> {
  for (const patch of patches) {
    for (const field of Object.keys(patch.values)) yield fieldMark(patch.entity, patch.id, field)
  }
}

/**
 * The failures of what the roots still reach. A released connection's or
 * entity's failure goes with it, so asking for it again later asks the server
 * again rather than repeating an error that may no longer hold.
 *
 * An entity counts as reached if retention kept it or a root names it by id:
 * one that failed before it ever loaded has no entry to keep.
 */
const prunedFailures = (
  failures: Failures,
  roots: RetentionRoots,
  entities: EntityStore,
): Failures => {
  const named = new Set(roots.connections.map(root => root.identity))
  const connections = Object.entries(failures.connections).filter(([identity]) =>
    named.has(identity),
  )
  const asked = new Set(roots.requirements.map(root => entityKey(root.entity, root.id)))
  const fields = Object.entries(failures.fields).filter(([mark]) => {
    const key = mark.slice(0, mark.indexOf('\u0000'))
    return asked.has(key) || key in entities
  })
  return connections.length === Object.keys(failures.connections).length &&
    fields.length === Object.keys(failures.fields).length
    ? failures
    : { connections: Object.fromEntries(connections), fields: Object.fromEntries(fields) }
}

/** Whether this field's last read failed and nothing has settled it since. */
export const isFieldFailed = (
  model: RemoteModel,
  entity: string,
  id: string,
  field: string,
): boolean => fieldMark(entity, id, field) in model.failures.fields

/**
 * The first failure among the fields `relation` reads of an entity, following
 * each relation the store holds into its targets, as `assemble` does. A read
 * that consults it shows `Failed` for a related entity's failure too, rather
 * than waiting on a field nothing will fetch.
 */
export const failureOf = (
  model: RemoteModel,
  entity: string,
  id: string,
  relation: RelationRequirement,
): RemoteError | undefined => {
  const failed = model.failures.fields
  if (Object.keys(failed).length === 0) return undefined
  const seen = new Set<string>()
  const walk = (
    target: string,
    targetId: string,
    requirement: RelationRequirement,
  ): RemoteError | undefined => {
    const key = entityKey(target, targetId)
    if (seen.has(key)) return undefined
    seen.add(key)
    for (const field of requirement.fields) {
      const error = failed[fieldMark(target, targetId, field)]
      if (error !== undefined) return error
      const nested = requirement.relations?.[field]
      if (nested === undefined) continue
      const value = readField(model.entities, key, field)
      if (value._tag === 'None') continue
      for (const ref of targetsOf(value.value, nested)) {
        const found = walk(ref.entity, ref.id, nested)
        if (found !== undefined) return found
      }
    }
    return undefined
  }
  return walk(entity, id, relation)
}

/** Appends (after) or prepends (before) an incoming page onto the stored one. */
const mergeWireRefPages = (
  current: RefPageValue,
  next: RefPageValue,
  direction: 'after' | 'before',
): RefPageValue => {
  const refs =
    direction === 'after'
      ? [...new Set([...current.refs, ...next.refs])]
      : [...new Set([...next.refs, ...current.refs])]
  // The far boundary is the incoming page's; the near one is still the stored page's.
  return direction === 'after'
    ? { refs, hasNext: next.hasNext, hasPrevious: current.hasPrevious }
    : { refs, hasNext: current.hasNext, hasPrevious: next.hasPrevious }
}

/**
 * Writes a read result into the store, recording each field's applied window so
 * a later request with a different window refetches. A relation page requested
 * with a cursor is merged onto the page already stored, so "load more"
 * accumulates rather than replaces. Every read path should use this rather than
 * reducing `writeEntity` by hand.
 */
export const writeRead = (
  store: EntityStore,
  requests: ReadonlyArray<Requirement>,
  result: Schema.Schema.Type<typeof ReadBatchResult>,
  now = 0,
): EntityStore => {
  const returned = new Map<string, Record<string, unknown>>()
  for (const entity of result.entities) {
    const key = entityKey(entity.entity, entity.id)
    returned.set(key, { ...returned.get(key), ...entity.values })
  }
  const byEntity = new Map<
    string,
    { windows: Record<string, string>; merge: Map<string, 'after' | 'before'> }
  >()
  // A request's windows apply to its entity; a relation's windows apply to
  // each target the returned refs name, and so on down the graph.
  const record = (
    key: string,
    windows: Requirement['windows'],
    relations: Requirement['relations'],
  ): void => {
    let entry = byEntity.get(key)
    if (entry === undefined) {
      entry = { windows: {}, merge: new Map() }
      byEntity.set(key, entry)
    }
    for (const [field, window] of Object.entries(windows ?? {})) {
      entry.windows[field] = windowKey(window)
      const direction =
        window.after !== undefined ? 'after' : window.before !== undefined ? 'before' : undefined
      if (direction !== undefined) entry.merge.set(field, direction)
    }
    const values = returned.get(key)
    if (values === undefined) return
    for (const [field, relation] of Object.entries(relations ?? {})) {
      for (const ref of targetsOf(values[field], relation)) {
        record(entityKey(ref.entity, ref.id), relation.windows, relation.relations)
      }
    }
  }
  for (const request of requests) {
    record(entityKey(request.entity, request.id), request.windows, request.relations)
  }

  const writes: EntityWrite[] = []
  const pending = new Map<string, Record<string, unknown>>()
  for (const entity of result.entities) {
    const key = entityKey(entity.entity, entity.id)
    const entry = byEntity.get(key)
    let values = entity.values
    if (entry !== undefined && entry.merge.size > 0) {
      // A cursor page merges onto the page stored (or written earlier in this result).
      const previous = pending.get(key) ?? store[key]?.values
      if (previous !== undefined) {
        const merged: Record<string, unknown> = { ...values }
        for (const [field, direction] of entry.merge) {
          const incoming = values[field]
          const existing = previous[field]
          if (isRefPage(incoming) && isRefPage(existing)) {
            merged[field] = mergeWireRefPages(existing, incoming, direction)
          }
        }
        values = merged
      }
    }
    pending.set(key, { ...pending.get(key), ...values })
    writes.push({ key, values, windows: entry?.windows })
  }
  // The server was asked for these ids by name and answered without them.
  // Whether the entity never existed, is gone, or is not this principal's to
  // see, the client knows the same thing: it is not there. Without this the read
  // would stay `Loading` for good. A forced plan (`refresh`) asks again, and any
  // later write clears the tombstone.
  //
  // Only ids asked for directly: the target of a returned ref is left alone. A
  // server need not expand a relation that rides on a request; the planner
  // follows a relation the store holds and asks for its targets by id next, and
  // a tombstone here would stop it.
  let answered = store
  for (const request of requests) {
    const key = entityKey(request.entity, request.id)
    if (!returned.has(key)) answered = tombstone(answered, key)
  }
  return writeEntities(answered, writes, now)
}
