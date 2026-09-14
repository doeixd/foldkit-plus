/**
 * The Remote submodel: the store, connections, mutations, live state, and
 * optimistic layers an application keeps in its Model, the Messages that
 * change it, and the pure reducer over them.
 */
import { Schema } from 'effect'
import type { Requirement } from 'foldkit-surface'
import { emptyConnection, merge, type Connection, type Segment } from './connection.js'
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
  setStale,
  writeEntities,
  type EntityStore,
  type EntityWrite,
} from './store.js'
import { windowKey } from './plan.js'
import { isRefPage, targetsOf, type RefPageValue } from './relation.js'
import { gc, type RetentionRoots } from './retain.js'
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
}

export const initialRemoteModel: RemoteModel = {
  entities: emptyStore,
  connections: {},
  optimistic: emptyOptimistic,
  live: {},
  mutations: emptyMutationState,
  gaps: new Set(),
  loading: new Set(),
}

/** The entity store and the mutation ledger are runtime values, not wire shapes. */
const runtimeSchema = Schema.Unknown

export const remoteModelSchema = (): Schema.Schema<RemoteModel> =>
  Schema.Struct({
    entities: runtimeSchema,
    connections: Schema.Record(Schema.String, runtimeSchema),
    optimistic: runtimeSchema,
    live: Schema.Record(Schema.String, runtimeSchema),
    mutations: runtimeSchema,
    gaps: runtimeSchema,
    loading: runtimeSchema,
  }) as unknown as Schema.Schema<RemoteModel>

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
    }
  /** A refetch of present fields began; they read as `Refreshing` until it lands. */
  | { readonly _tag: 'RefreshStarted'; readonly requests: readonly Requirement[] }
  /** A read began; the fields it asks for that the store lacks read as `Loading`. */
  | { readonly _tag: 'ReadStarted'; readonly requests: readonly Requirement[] }
  /** The active Surfaces' roots changed; everything they do not reach is collected. */
  | { readonly _tag: 'RetentionChanged'; readonly roots: RetentionRoots }
  /** A restored snapshot meets the store; runtime state is untouched. */
  | { readonly _tag: 'Hydrated'; readonly entities: EntityStore; readonly merge: MergePolicy }
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
    }
  | { readonly _tag: 'MutationFailed'; readonly requestId: string; readonly error: RemoteError }
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
  /** A query for the connection failed; it reads as it did before the request. */
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
  ReadFailed: { requests: Schema.Array(ReadRequest), error: remoteErrorSchema },
  RefreshStarted: { requests: Schema.Array(ReadRequest) },
  ReadStarted: { requests: Schema.Array(ReadRequest) },
  RetentionChanged: { roots: retentionRootsSchema },
  Hydrated: {
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
  },
  MutationFailed: { requestId: Schema.String, error: remoteErrorSchema },
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

const marksOf = (
  requests: ReadonlyArray<Requirement>,
): ReadonlyArray<readonly [string, ReadonlyArray<string>]> =>
  requests.map(request => [entityKey(request.entity, request.id), request.fields] as const)

/**
 * One mark per requested field. A read is identified by what it asks for, not by
 * a request id: two reads asking for one field share its mark, so the first
 * answer clears it. Over-clearing shows `Initial` rather than a spinner, which
 * is the safer way to be wrong.
 */
const loadingMarks = function* (requests: ReadonlyArray<Requirement>): Generator<string> {
  for (const request of requests) {
    const key = entityKey(request.entity, request.id)
    for (const field of request.fields) yield `${key}\u0000${field}`
  }
}

const withLoading = (
  loading: ReadonlySet<string>,
  requests: ReadonlyArray<Requirement>,
): ReadonlySet<string> => {
  const next = new Set(loading)
  for (const mark of loadingMarks(requests)) next.add(mark)
  return next
}

const withoutLoading = (
  loading: ReadonlySet<string>,
  requests: ReadonlyArray<Requirement>,
): ReadonlySet<string> => {
  if (loading.size === 0) return loading
  const next = new Set(loading)
  for (const mark of loadingMarks(requests)) next.delete(mark)
  return next
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
  const key = entityKey(entity, id)
  return fields.some(field => model.loading.has(`${key}\u0000${field}`))
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
      }
    case 'ReadFailed':
      // The read is over; the fields read as they did before it started. A field
      // it never delivered goes back to `Initial`, not a spinner that never ends.
      return {
        ...model,
        entities: setStale(model.entities, marksOf(message.requests), false),
        loading: withoutLoading(model.loading, message.requests),
      }
    case 'RetentionChanged':
      return { ...model, ...gc(model, message.roots) }
    case 'Hydrated':
      return {
        ...model,
        entities: RemotePersistence.mergeStores(model.entities, message.entities, message.merge),
      }
    case 'RefreshStarted':
      return { ...model, entities: setStale(model.entities, marksOf(message.requests), true) }
    case 'ReadStarted':
      return { ...model, loading: withLoading(model.loading, message.requests) }
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
      )
      return {
        ...model,
        entities: settled.store,
        mutations: settled.state,
        optimistic: settled.optimistic,
      }
    }
    case 'MutationFailed':
      return {
        ...model,
        mutations: failMutation(model.mutations, message.requestId),
        optimistic: settleFailure(model.optimistic, message.requestId),
      }
    case 'LiveReceived': {
      const state = model.live[message.stream] ?? emptyLiveState
      if (message.event._tag === 'EntityPatched' || message.event._tag === 'EntityDeleted') {
        const applied = applyEntityEvent(state, model.entities, message.event, message.now)
        return applied.outcome === 'gap'
          ? markGap(model, message.stream)
          : clearGap(
              {
                ...model,
                entities: applied.store,
                live: { ...model.live, [message.stream]: applied.state },
              },
              message.stream,
            )
      }
      const applied = applyConnectionEvent(state, model.optimistic, message.event, message.policy)
      return applied.outcome === 'gap'
        ? markGap(model, message.stream)
        : clearGap(
            {
              ...model,
              optimistic: applied.optimistic,
              live: { ...model.live, [message.stream]: applied.state },
            },
            message.stream,
          )
    }
    case 'GapCleared':
      return clearGap(model, message.stream)
    case 'ConnectionMerged': {
      const current = model.connections[message.connection] ?? emptyConnection
      const merged = merge(current, message.page)
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
      }
    }
    case 'ConnectionInvalidated':
      return {
        ...model,
        connections: setConnectionStale(model.connections, message.connection, true),
      }
    case 'QueryFailed':
      // The refresh is over; the connection reads as it did before it started,
      // and one the Model never held stays absent.
      return message.connection in model.connections
        ? {
            ...model,
            connections: setConnectionStale(model.connections, message.connection, false),
          }
        : model
    case 'ConnectionRefreshed':
      return {
        ...model,
        connections: setConnectionStale(model.connections, message.connection, false),
      }
  }
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
  return writeEntities(store, writes, now)
}
