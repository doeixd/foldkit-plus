/**
 * The Remote submodel: the store, connections, mutations, live state, and
 * optimistic layers an application keeps in its Model, the Messages that
 * change it, and the pure reducer over them.
 */
import { Effect, Match, Option, Schema } from 'effect'
import {
  liveRefused,
  outboxUnreadable,
  outboxUnsaved,
  PredictionPart,
  predictionMismatch,
  withDiagnostics,
  type RemoteDiagnostic,
} from './diagnostics.js'
import type { RelationRequirement, Requirement } from './requirement.js'
import {
  emptyConnection,
  merge,
  unknown as unknownBoundary,
  type Boundary,
  type Connection,
  type Edge,
  type Segment,
} from './connection.js'
import { noKept, type Kept } from './kept.js'
import { emptyOptimistic, layersIn, liveIn, type Capabilities } from './capability.js'
import { isPatch } from './shown.js'
import type { ConnectionChange, OptimisticState, OptimisticOperation } from './optimistic.js'
import { emptyLiveState, type AwaitedEcho, type LiveEvent, type LiveState } from './liveState.js'
import {
  beginMutation,
  emptyMutationState,
  failMutation,
  forgetFailure,
  settledLater,
  type MutationState,
  type NormalizedPatch,
} from './ledger.js'
import {
  emptyOutbox,
  leftOf,
  MadeAs,
  madeAsOf,
  ownerAfter,
  ownerOf,
  stampOf,
  operationOf,
  Queued,
  revisionOf,
  withDone,
  type OutboxState,
  type ReadEntry,
} from './queue.js'
import type { StoredWrite } from './outboxStore.js'
import {
  askAgain,
  clearFloors,
  entityKey,
  entry as storeEntry,
  emptyStore,
  isTombstone,
  mergeStores,
  readField,
  remove,
  setFloors,
  setStale,
  setUnavailable,
  tombstone,
  writeEntities,
  type EntityKey,
  type EntityStore,
  type EntityWrite,
  type MergePolicy,
} from './store.js'
import { windowKey } from './plan.js'
import { isRefPage, targetsOf, type RefPageValue } from './relation.js'
import {
  budgeted,
  defaultBudget,
  defaultHistoryWindow,
  gc,
  heldForHistory,
  heldRoots,
  noNavigationHistory,
  noRecentRoots,
  reachable,
  type ConnectionRoot,
  type HistoryHold,
  type NavigationHistory,
  type NavigationKind,
  type ReadRoot,
  type RecentRoots,
  type Retained,
  type RetentionRoots,
} from './retain.js'
import {
  AnswerList,
  AnswerRead,
  NormalizedEntity,
  QueryRequest,
  ReadAfter,
  ReadBatchResult,
  ReadRequest,
  readRequestFields,
  RelationRequest,
  RowToken,
  SettledFields,
  type RemoteLiveRefused,
} from './wire.js'
import { own, put } from './record.js'
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
  /**
   * How many rows `Data.more` has grown a read's window to, by
   * `windowGrowthKey`. A read shows at most its window, so this is what "load
   * more" changes; it lives here because a list holds no state of its own.
   */
  readonly grown: Readonly<Record<string, number>>
  /** Optimistic entity layers and connection overlays over the base store. */
  readonly optimistic: OptimisticState
  /** Live cursor and boundary state, keyed by the subscription's stream key. */
  readonly live: Readonly<Record<string, LiveState>>
  /** Mutation pending/applied/failed ledger. */
  readonly mutations: MutationState
  /**
   * The durable writes (`Data.mutate`'s `durable`) not yet settled, every
   * tab's, in the order the outbox sends them, and what its store holds.
   * Each is in `mutations` too, as any write is.
   */
  readonly outbox: OutboxState
  /**
   * Streams that broke, by an error or by an event ahead of their cursor, and
   * have not resubscribed since: changes after the break are missed until the
   * live entry restarts them and refetches what they cover.
   */
  readonly gaps: ReadonlySet<string>
  /** Each live stream that has ever broken, by stream key. One that never broke is absent. */
  readonly streams: Readonly<Record<string, StreamHealth>>
  /**
   * The `entity\0id\0field` marks a read is currently fetching. A field absent
   * from the store reads as `Loading` while its mark is here and `Initial`
   * otherwise, which is what separates "being fetched" from "nothing is
   * fetching this".
   */
  readonly loading: ReadonlySet<string>
  /**
   * The marks of `loading` each read entry set, by the entry's key (`by`), so
   * a restart that no longer asks for them takes back its own and leaves
   * another entry's. A mark an answer cleared is ignored here.
   */
  readonly loadingBy: Readonly<Record<string, ReadonlySet<string>>>
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
  /**
   * The storage key the cache was last restored from, through `Hydrated`'s
   * `from`. `persistence(Data, …)` saves under a key only once its own snapshot is
   * in, so a save at startup cannot write the empty store over it, and
   * restores only a key the Model is not yet restored from.
   */
  readonly restoredFrom: Option.Option<string>
  /**
   * Under `verifyPredictions`, the order each list was placed in, by edge key,
   * and the rows placing took out of its first page, until the server's page
   * for it arrives to be compared with them.
   */
  readonly placed: Readonly<Record<string, PlacedOrder>>
  /**
   * What the client met and kept going past, oldest first: under
   * `verifyPredictions` each part of a prediction the server's answer
   * disagreed with, and each failed write the application's update does not
   * hear. The newest
   * 256 are kept; the wiring reports each as it is recorded.
   */
  readonly diagnostics: ReadonlyArray<RemoteDiagnostic>
  /**
   * Why each stale list went stale, in the client's own words: what a write
   * changed that it could not place, the server's live stream asking, a
   * refresh (#489). Kept from the change that made it stale, and read by
   * `why` only while it still is. Never persisted.
   */
  readonly staleBecause: Readonly<Record<string, string>>
  /**
   * What retention keeps: the active Surfaces' roots, and those of the
   * Surfaces left, in the batches they left in, while the budget allows. A
   * list left is held stale, so going back reads it `Refreshing` while it
   * refetches, unless its age says when it is due (`ConnectionRoot.ages`),
   * or a history navigation comes back to it within its window (`history`).
   */
  readonly recent: RecentRoots
  /**
   * The roots of Surfaces left that the budget evicted, newest last, the
   * newest 256 of each: lists by identity, reads by row. `why` reads a
   * list or row absent from the store as `Evicted` while it is named here.
   */
  readonly evicted: Evicted
  /**
   * The navigations the application reported (`Navigated`), and the lists
   * left that a history navigation back reads as they were: `Ready`, asked
   * for by nothing, rather than `Refreshing`.
   */
  readonly history: NavigationHistory
  /**
   * The rows a write's answer wrote, by entity key, that a live stream has not
   * sent back yet (#485). Until a stream does, its patches to those fields
   * predate the write or, from a stream that coalesces, may follow it; one
   * that disagrees is read again rather than written. A read asked after the
   * answer, a later answer, a delete or `forget` ends the wait.
   */
  readonly echoes: Readonly<Record<EntityKey, AwaitedEcho>>
  /**
   * What each row's fields held before the first live patch that landed while
   * a write was pending (#498, #499). A relative layer resolves over these
   * values, so its own echo is not counted twice, and an answer learns which
   * fields a stream wrote since its request started. A field's entry ends when
   * an answer writes it; all end when no write is pending, on `forget`, when a
   * live event deletes the row, and `echoKept` after the patch.
   */
  readonly kept: Kept
}

/** What the budget evicted, by list identity and by the row a read reads. */
export interface Evicted {
  readonly connections: ReadonlyArray<string>
  readonly rows: ReadonlyArray<EntityKey>
}

const noEvicted: Evicted = { connections: [], rows: [] }

/** How many evicted lists, and rows, `evicted` remembers. */
const EVICTED_KEPT = 256

/** `names` with `added` moved to the end, the oldest dropped past `EVICTED_KEPT`. */
const remembered = (
  names: ReadonlyArray<string>,
  added: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  if (added.length === 0) return names
  const fresh = new Set(added)
  const next = [...names.filter(name => !fresh.has(name)), ...fresh]
  return next.slice(Math.max(0, next.length - EVICTED_KEPT))
}

/** A list's first page as the client placed it: its keys in order, and those it took out. */
export interface PlacedOrder {
  readonly order: ReadonlyArray<string>
  readonly dropped: ReadonlyArray<string>
  /**
   * The list is stale only so the page to check against is fetched: it reads
   * as fresh meanwhile, as it would without the check. An invalidation clears it.
   */
  readonly checking: boolean
}

/**
 * Whether a list reads as stale: as its connection says, unless it is stale
 * only for `verifyPredictions` to fetch the page its placement is checked
 * against, or only for being left, and a history navigation came back to it.
 */
export const readsStale = (remote: RemoteModel, identity: string): boolean =>
  remote.connections[identity]?.stale === true &&
  remote.placed[identity]?.checking !== true &&
  !heldForHistory(remote.history, remote.connections, identity)

/** How a live stream has fared, as its live entry restarts it. */
export interface StreamHealth {
  /** How many times it broke. The live entry restarts on each, so it only grows. */
  readonly restarts: number
  /** Breaks since its last applied event: what the restart's backoff grows with. */
  readonly failures: number
  /** Why it last broke; none for a gap, which is not an error. */
  readonly error: Option.Option<RemoteError>
  /**
   * The server's refusal of what it asks (`RemoteLiveRefused`). A refused
   * stream is no gap and does not restart: asking again is refused again.
   */
  readonly refused: Option.Option<RemoteError>
}

/**
 * Failed reads, as the errors they failed with.
 *
 * `connections` is by connection identity, and is settled by a page arriving,
 * an invalidation, or retention dropping the connection. `fields` is by field
 * mark (`entity\0id\0field`, the marks `loading` uses), and is settled by the
 * field being written again, a refresh asking for it, or retention dropping the
 * entity. A read of it in flight reads `Loading` over the failure without
 * settling it: if that read fails too, the failure is simply recorded again.
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
  /**
   * The generation every entry is refreshed at, at least: `forgetRemote` moves
   * it, so every read and live entry restarts, and a read or stream begun for
   * the principal before is interrupted rather than landing after.
   */
  readonly floor: number
}

export const emptyRefresh: RefreshState = {
  generation: 0,
  requested: new Map(),
  started: new Map(),
  floor: 0,
}

/**
 * The Model with everything the server told it forgotten: values, tombstones,
 * unavailable fields, connections, live cursors, failures, and what is in
 * flight. For a change of principal, whose facts these were. The mutation
 * sequence is kept, so request ids stay unique, and a mutation in flight is
 * treated as applied: its answer, when it comes, writes nothing here.
 *
 * `restoredFrom` is kept too: the emptied store is now what that key holds,
 * so `persistence(Data, …)` saves it over the old snapshot and never restores the
 * key again. Restoring would bring back exactly what was forgotten.
 */
export const forgetRemote = (model: RemoteModel): RemoteModel => {
  const generation = model.refresh.generation + 1
  return {
    ...initialRemoteModel,
    restoredFrom: model.restoredFrom,
    refresh: { generation, requested: new Map(), started: new Map(), floor: generation },
    mutations: {
      ...emptyMutationState,
      sequence: model.mutations.sequence,
      applied: new Set([...model.mutations.applied, ...model.mutations.pending]),
    },
    // The writes stay in their own key's store, for that principal's return.
    // The session is this page's, and keeps naming its operations.
    outbox: { ...emptyOutbox, session: model.outbox.session, left: leftOf(model.outbox) },
  }
}

export const initialRemoteModel: RemoteModel = {
  entities: emptyStore,
  connections: {},
  grown: {},
  optimistic: emptyOptimistic,
  live: {},
  mutations: emptyMutationState,
  outbox: emptyOutbox,
  gaps: new Set(),
  streams: {},
  loading: new Set(),
  loadingBy: {},
  refresh: emptyRefresh,
  failures: noFailures,
  restoredFrom: Option.none(),
  placed: {},
  diagnostics: [],
  staleBecause: {},
  recent: noRecentRoots,
  evicted: noEvicted,
  history: noNavigationHistory,
  echoes: {},
  kept: noKept,
}

/** The entity store and the mutation ledger are runtime values, not wire shapes. */
const runtimeSchema = Schema.Unknown

/**
 * A runtime field added after Models were already encoded (stored, resumed,
 * recorded by devtools): one encoded before it decodes with it empty, rather
 * than refusing the whole Model.
 */
const addedRecord = Schema.Unknown.pipe(Schema.withDecodingDefaultKey(Effect.succeed({})))
const addedKept = Schema.Unknown.pipe(Schema.withDecodingDefaultKey(Effect.succeed(noKept)))

export const remoteModelSchema = (): Schema.Codec<RemoteModel, unknown> =>
  // The runtime fields decode as `unknown`; their types come from `RemoteModel`.
  Schema.Struct({
    entities: runtimeSchema,
    connections: Schema.Record(Schema.String, runtimeSchema),
    grown: Schema.Record(Schema.String, Schema.Number),
    optimistic: runtimeSchema,
    live: Schema.Record(Schema.String, runtimeSchema),
    mutations: runtimeSchema,
    outbox: runtimeSchema,
    gaps: runtimeSchema,
    streams: Schema.Record(Schema.String, runtimeSchema),
    loading: runtimeSchema,
    loadingBy: runtimeSchema,
    refresh: runtimeSchema,
    failures: Schema.Struct({
      connections: Schema.Record(Schema.String, remoteErrorSchema),
      fields: Schema.Record(Schema.String, remoteErrorSchema),
    }),
    restoredFrom: runtimeSchema,
    placed: runtimeSchema,
    diagnostics: runtimeSchema,
    staleBecause: addedRecord,
    recent: runtimeSchema,
    evicted: runtimeSchema,
    history: runtimeSchema,
    echoes: addedRecord,
    kept: addedKept,
  }) as unknown as Schema.Codec<RemoteModel, unknown>

/** The submodel's Messages; each reduces to `RemoteModel` through `updateRemote`. */
export type RemoteMessage =
  | {
      readonly _tag: 'ReadReceived'
      readonly requests: readonly Requirement[]
      readonly result: Schema.Schema.Type<typeof ReadBatchResult>
      readonly now: number
      /**
       * The read-after tokens the read was sent with (`ReadBatch.after`): an
       * answer ends a row's floor only for the token it was asked at.
       */
      readonly after?: ReadonlyArray<Schema.Schema.Type<typeof RowToken>> | undefined
      /**
       * The refresh generation the request was planned or sent under. An
       * answer from before the last `forget` is the previous principal's and
       * writes nothing (#484); whom an answer was for is heard only from a
       * request sent since (#405). Without it, the answer is applied and its
       * principal not heard.
       */
      readonly generation?: number | undefined
    }
  | {
      readonly _tag: 'ReadFailed'
      readonly requests: readonly Requirement[]
      readonly error: RemoteError
      /** The generation the read or stream was asked under: see `ReadReceived.generation`. */
      readonly generation?: number | undefined
      /**
       * The live stream whose subscription broke, when this is that rather
       * than a read. Nothing was being read, so no field failed: the stream is
       * recorded as a gap, since changes after it are missed until the live
       * entry restarts it.
       */
      readonly stream?: string | undefined
    }
  /**
   * A refetch of present fields, and of held lists whole, began; they read as
   * `Refreshing` until it lands.
   */
  | {
      readonly _tag: 'RefreshStarted'
      readonly requests: readonly Requirement[]
      /** Held lists asked for again by identity: marked stale, as an invalidation does. */
      readonly connections?: readonly string[] | undefined
    }
  /** A read began; the fields it asks for that the store lacks read as `Loading`. */
  | {
      readonly _tag: 'ReadStarted'
      readonly requests: readonly Requirement[]
      /** The refresh generation the read was planned under. */
      readonly refresh?: number | undefined
      /** The read entry that started it, which owns its marks (`loadingBy`). */
      readonly by?: string | undefined
    }
  /**
   * A read entry restarted and no longer asks for what these marks name: the
   * read it sent was interrupted, and no answer will clear them. Each goes
   * unless another entry's read set it too.
   */
  | { readonly _tag: 'ReadAbandoned'; readonly by: string; readonly marks: readonly string[] }
  /**
   * Queries for these connections were sent. One with nothing to show reads
   * `Loading` until its page or its failure arrives, which is what separates
   * "being fetched" from `Initial`, "nothing is fetching this".
   */
  | {
      readonly _tag: 'QueryStarted'
      readonly connections: readonly string[]
      /** The read entry that started it, which owns its marks (`loadingBy`). */
      readonly by?: string | undefined
    }
  /**
   * The active Surfaces' roots changed; everything they and the roots kept
   * for going back do not reach is collected.
   */
  | {
      readonly _tag: 'RetentionChanged'
      readonly roots: RetentionRoots
      /** How many entries, rows and lists, retention keeps; `defaultBudget` when absent. */
      readonly budget?: number | undefined
      /**
       * When the roots changed, in milliseconds since the epoch. Given, a list
       * left is held for a history navigation back until `historyWindow` after
       * it, and a list shown again is judged against its hold.
       */
      readonly now?: number | undefined
      /** How long a list left is held for going back, in milliseconds; `defaultHistoryWindow` when absent. */
      readonly historyWindow?: number | undefined
    }
  /**
   * The application navigated: `history` for Back and Forward, `push` for a
   * navigation the reader started. Reduced before the route changes, so the
   * lists the new route shows are judged by it (`Site.routing`'s `navigated`).
   */
  | { readonly _tag: 'Navigated'; readonly kind: NavigationKind }
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
        | Readonly<Record<string, ReadonlyArray<ReadonlyArray<Edge>>>>
        | undefined
      /**
       * When the page that last answered each restored connection whole
       * arrived, by identity: its age, kept across the reload. 0 for one not
       * named.
       */
      readonly receivedAt?: Readonly<Record<string, number>> | undefined
      readonly merge: MergePolicy
      /** The storage key the snapshot was read from, when it was: `restoredFrom`. */
      readonly from?: string | undefined
    }
  /** A mutation began; its optimistic operations show until it settles. */
  | {
      readonly _tag: 'MutationStarted'
      readonly requestId: string
      readonly optimistic?: ReadonlyArray<OptimisticOperation> | undefined
      /**
       * Who the operation is predicted for: what a list's `Expr.viewer` reads
       * while the client places the rows it changes. `Data.mutate` gives
       * `Remote.make`'s viewer; absent, a list over the viewer is the server's.
       */
      readonly viewer?: { readonly entity: string; readonly id: string } | undefined
      /**
       * Which mutation, with what input: what the ledger keeps until the
       * request applies, so a failure can be listed and retried. `Data.mutate`
       * always gives it.
       */
      readonly write?:
        | {
            readonly mutation: string
            readonly input: unknown
            readonly keys?: ReadonlyArray<string> | undefined
            /** When the reader acted: what the request sends, and a retry sends again. */
            readonly now?: number | undefined
            /**
             * Queued in the outbox rather than sent: the input encoded, and
             * what the reader was shown, as the store keeps them. The request
             * id is the operation id.
             */
            readonly durable?:
              | {
                  readonly input: unknown
                  readonly shown: ReadonlyArray<RelationRequirement>
                  /** The lists it asks back with its answer. */
                  readonly lists?:
                    | ReadonlyArray<Schema.Schema.Type<typeof QueryRequest>>
                    | undefined
                }
              | undefined
          }
        | undefined
    }
  /** What `Data.mutate`'s Command answers for a durable write, which the outbox sends: nothing. */
  | { readonly _tag: 'MutationQueued'; readonly requestId: string }
  /**
   * What the outbox's store under `key` holds, read entry by entry: written
   * there by this page or another tab. `session` is given by a restore, for
   * a page that has none; `unsaved` says why the store could not be written,
   * when it could not, and the entries are then this page's own.
   */
  | {
      readonly _tag: 'OutboxRead'
      readonly key: string
      readonly scope: string
      readonly session?: string | undefined
      readonly entries: ReadonlyArray<ReadEntry>
      readonly done: ReadonlyArray<string>
      readonly unsaved?: string | undefined
      /**
       * Who owns the queue, as pages holding it heard (`ownerAfter`): a page
       * that has heard no one yet stamps its writes with it (#405).
       */
      readonly owner?: MadeAs | undefined
    }
  /** A durable write was sent and nothing answered; it is sent again after a wait. */
  | {
      readonly _tag: 'OutboxDelayed'
      readonly requestId: string
      readonly attempt: number
      readonly error: RemoteError
    }
  /**
   * Writes made with no one signed in, waiting under the `from` scope's queue,
   * moved to the `to` scope's queue once an answer named who signed in: sent
   * as them from then on. `from` and `to` are one scope for writes stamped in
   * place, a visitor's or ones made before any answer said who, when an
   * answer names someone without the scope moving. Said once, by the tab
   * that moved them, for the application to tell the person (#405). It
   * changes nothing in the Model.
   */
  | {
      readonly _tag: 'OutboxMoved'
      readonly requestIds: ReadonlyArray<string>
      readonly from: string
      readonly to: string
    }
  /**
   * Writes in the `scope`'s queue made for someone other than whom an answer
   * names now (the cookie changed hands while the scope did not): none is
   * sent, nor any after them, until an answer names whom they were made for
   * again. Said once per change, by each page that hears it (#405). It
   * changes nothing in the Model.
   */
  | {
      readonly _tag: 'OutboxHeld'
      readonly requestIds: ReadonlyArray<string>
      readonly scope: string
    }
  | {
      readonly _tag: 'MutationSucceeded'
      readonly requestId: string
      readonly entities: readonly NormalizedPatch[]
      /** Connection changes the server confirmed; they replace the request's own. */
      readonly connections?: ReadonlyArray<ConnectionChange> | undefined
      /** Entities the mutation deleted: tombstoned, which hides them from every connection. */
      readonly deleted?: ReadonlyArray<{ readonly entity: string; readonly id: string }> | undefined
      /**
       * What the answer read of the rows it names, for the fields the request
       * said it shows: written as a read is, in the same reduction.
       */
      readonly read?: Schema.Schema.Type<typeof AnswerRead> | undefined
      /**
       * The first page of each list the request asked back, read after the
       * write: a list the answer leaves to be fetched again takes its page in
       * the same reduction instead.
       */
      readonly lists?: ReadonlyArray<Schema.Schema.Type<typeof AnswerList>> | undefined
      /** Injected clock reading of the answer: how fresh the written entities are. */
      readonly now: number
      /** Whom the answer was for, where `MutationResult.principal` said. */
      readonly principal?: MadeAs | undefined
      /**
       * The refresh generation the request was planned or sent under: whom
       * the answer was for is heard only from a request sent since the last
       * `forget` (#405). Without it, it is not heard.
       */
      readonly generation?: number | undefined
      /**
       * A read of the rows the write wrote is current only at or after this
       * token (`MutationResult.after`): each row is held to it (`floor`).
       */
      readonly after?: Schema.Schema.Type<typeof ReadAfter> | undefined
    }
  | {
      readonly _tag: 'MutationFailed'
      readonly requestId: string
      readonly error: RemoteError
      /** The operation id it was sent with, for a retry to send again. */
      readonly operation: string
    }
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
  /** `Data.more`: a read's window, by `windowGrowthKey`, now shows `size` rows. */
  | { readonly _tag: 'WindowGrown'; readonly window: string; readonly size: number }
  | {
      readonly _tag: 'LiveReceived'
      readonly stream: string
      readonly event: LiveEvent
      readonly policy?: LivePolicy
      readonly now: number
      /** The `forget` floor the stream was opened under: see `ReadReceived.generation`. */
      readonly generation?: number | undefined
    }
  | { readonly _tag: 'GapCleared'; readonly stream: string }
  | {
      readonly _tag: 'ConnectionMerged'
      readonly connection: string
      readonly page: Segment
      /** The page answers the connection's refresh, so the merge also clears `stale`. */
      readonly refreshes?: boolean | undefined
      /**
       * The slice the query asked for, so the payload's entities write like a
       * read: one request per matching edge. Absent for a page from a server
       * that predates payload planning, which carries edges only.
       */
      readonly select?: RelationRequirement | undefined
      /** The selected fields of the page's items, as a read batch returns them. */
      readonly entities?:
        | ReadonlyArray<{
            readonly entity: string
            readonly id: string
            readonly values: Record<string, unknown>
          }>
        | undefined
      /** Fields asked for that the server settled without a value. */
      readonly settled?:
        | ReadonlyArray<{
            readonly entity: string
            readonly id: string
            readonly fields: ReadonlyArray<string>
          }>
        | undefined
      /** Injected clock reading of the answer, dating what the payload writes. */
      readonly now?: number | undefined
      /** Whom the answer was for, where `QueryResult.principal` said. */
      readonly principal?: MadeAs | undefined
      /** The refresh generation the query was planned under: see `ReadReceived.generation`. */
      readonly generation?: number | undefined
    }
  | { readonly _tag: 'ConnectionInvalidated'; readonly connection: string }
  | { readonly _tag: 'ConnectionRefreshed'; readonly connection: string }
  /**
   * A query for the connection failed. Its pages stay as they were, and it
   * reads `Failed` — with them as `previous`, when it has any — until a page
   * arrives, it is invalidated, or retention drops it.
   */
  | {
      readonly _tag: 'QueryFailed'
      readonly connection: string
      readonly error: RemoteError
      /** The refresh generation the query was planned under: see `ReadReceived.generation`. */
      readonly generation?: number | undefined
    }
  /**
   * What `Data.preload` read for a destination, as the Messages that wrote it,
   * reduced in order into the Model as it is now rather than the one the
   * preload started from.
   */
  | { readonly _tag: 'Preloaded'; readonly messages: ReadonlyArray<RemoteMessage> }
  /**
   * What the Command reporting recorded diagnostics returns once it has. It
   * changes nothing: the diagnostics stay in the Model.
   */
  | { readonly _tag: 'CompletedReportDiagnostics' }

const persistSchema = Schema.optional(Schema.Union([Schema.Number, Schema.Literal(false)]))

export const retentionRootsSchema = Schema.Struct({
  requirements: Schema.Array(
    Schema.Struct({ ...readRequestFields, persist: persistSchema }) as unknown as Schema.Codec<
      ReadRoot,
      ReadRoot
    >,
  ),
  connections: Schema.Array(
    Schema.Struct({
      identity: Schema.String,
      select: Schema.optional(RelationRequest),
      ages: Schema.optional(Schema.Boolean),
      persist: persistSchema,
    }),
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
    after: Schema.optional(Schema.Array(RowToken)),
    generation: Schema.optional(Schema.Number),
  },
  ReadFailed: {
    requests: Schema.Array(ReadRequest),
    error: remoteErrorSchema,
    stream: Schema.optional(Schema.String),
    generation: Schema.optional(Schema.Number),
  },
  RefreshStarted: {
    requests: Schema.Array(ReadRequest),
    connections: Schema.optional(Schema.Array(Schema.String)),
  },
  ReadStarted: {
    requests: Schema.Array(ReadRequest),
    refresh: Schema.optional(Schema.Number),
    by: Schema.optional(Schema.String),
  },
  ReadAbandoned: { by: Schema.String, marks: Schema.Array(Schema.String) },
  QueryStarted: { connections: Schema.Array(Schema.String), by: Schema.optional(Schema.String) },
  RetentionChanged: {
    roots: retentionRootsSchema,
    budget: Schema.optional(Schema.Number),
    now: Schema.optional(Schema.Number),
    historyWindow: Schema.optional(Schema.Number),
  },
  Navigated: { kind: Schema.Literals(['history', 'push']) },
  Hydrated: {
    connections: Schema.optional(Schema.Unknown),
    receivedAt: Schema.optional(Schema.Record(Schema.String, Schema.Number)),
    from: Schema.optional(Schema.String),
    entities: runtimeSchema,
    merge: Schema.Union([Schema.Literal('replace'), Schema.Literal('preserve-existing')]),
  },
  MutationStarted: {
    requestId: Schema.String,
    optimistic: Schema.optional(Schema.Array(Schema.Unknown)),
    viewer: Schema.optional(Schema.Struct({ entity: Schema.String, id: Schema.String })),
    write: Schema.optional(
      Schema.Struct({
        mutation: Schema.String,
        input: Schema.Unknown,
        keys: Schema.optional(Schema.Array(Schema.String)),
        now: Schema.optional(Schema.Number),
        durable: Schema.optional(
          Schema.Struct({
            input: Schema.Unknown,
            shown: Schema.Array(RelationRequest),
            lists: Schema.optional(Schema.Array(QueryRequest)),
          }),
        ),
      }),
    ),
  },
  MutationQueued: { requestId: Schema.String },
  OutboxRead: {
    key: Schema.String,
    scope: Schema.String,
    session: Schema.optional(Schema.String),
    entries: Schema.Array(Schema.Unknown),
    done: Schema.Array(Schema.String),
    unsaved: Schema.optional(Schema.String),
    owner: Schema.optional(MadeAs),
  },
  OutboxDelayed: { requestId: Schema.String, attempt: Schema.Number, error: remoteErrorSchema },
  OutboxMoved: {
    requestIds: Schema.Array(Schema.String),
    from: Schema.String,
    to: Schema.String,
  },
  OutboxHeld: { requestIds: Schema.Array(Schema.String), scope: Schema.String },
  MutationSucceeded: {
    requestId: Schema.String,
    entities: Schema.Array(NormalizedEntity),
    connections: Schema.optional(Schema.Array(Schema.Unknown)),
    deleted: Schema.optional(
      Schema.Array(Schema.Struct({ entity: Schema.String, id: Schema.String })),
    ),
    read: Schema.optional(AnswerRead),
    lists: Schema.optional(Schema.Array(AnswerList)),
    now: Schema.Number,
    principal: Schema.optional(MadeAs),
    generation: Schema.optional(Schema.Number),
    after: Schema.optional(ReadAfter),
  },
  MutationFailed: { requestId: Schema.String, error: remoteErrorSchema, operation: Schema.String },
  OverlayShown: { id: Schema.String, optimistic: Schema.Array(Schema.Unknown) },
  OverlayLifted: { id: Schema.String },
  WindowGrown: { window: Schema.String, size: Schema.Number },
  LiveReceived: {
    stream: Schema.String,
    event: Schema.Unknown,
    policy: Schema.optional(Schema.Unknown),
    now: Schema.Number,
    generation: Schema.optional(Schema.Number),
  },
  GapCleared: { stream: Schema.String },
  ConnectionMerged: {
    connection: Schema.String,
    page: Schema.Unknown,
    refreshes: Schema.optional(Schema.Boolean),
    select: Schema.optional(RelationRequest),
    entities: Schema.optional(Schema.Array(NormalizedEntity)),
    settled: Schema.optional(Schema.Array(SettledFields)),
    now: Schema.optional(Schema.Number),
    principal: Schema.optional(MadeAs),
    generation: Schema.optional(Schema.Number),
  },
  ConnectionInvalidated: { connection: Schema.String },
  ConnectionRefreshed: { connection: Schema.String },
  QueryFailed: {
    connection: Schema.String,
    error: remoteErrorSchema,
    generation: Schema.optional(Schema.Number),
  },
  Preloaded: {
    messages: Schema.Array(Schema.suspend(() => remoteMessageSchema)),
  },
  CompletedReportDiagnostics: {},
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
) as unknown as Schema.Codec<RemoteMessage, unknown>

/** An overlay's layer, named apart from every request's: a request id is the application's to choose too. */
const OVERLAY = 'overlay:'
const overlayLayer = (id: string): string => `${OVERLAY}${id}`

/** The ids `OverlayShown` shows now, each once, in the order they are drawn. */
export const overlaysOf = (model: RemoteModel): ReadonlyArray<string> => [
  ...new Set(
    [...model.optimistic.layers, ...model.optimistic.overlays].flatMap(({ id }) =>
      id.startsWith(OVERLAY) ? [id.slice(OVERLAY.length)] : [],
    ),
  ),
]

/** The key a grown window is kept under: its connection and the window first asked for. */
export const windowGrowthKey = (identity: string, window: string): string =>
  `${identity}\u0000${window}`

/**
 * Whether only overlays show this entity: the server has told the store
 * nothing of it and no request's layer writes it, so nothing will fetch what an
 * overlay leaves out.
 */
export const onlyOverlaid = (model: RemoteModel, entity: string, id: string): boolean => {
  if (Object.hasOwn(model.entities, entityKey(entity, id))) return false
  const writers = model.optimistic.layers.filter(layer =>
    layer.patches.some(patch => patch.entity === entity && patch.id === id),
  )
  return writers.length > 0 && writers.every(layer => layer.id.startsWith('overlay:'))
}

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
export const fieldMark = (entity: string, id: string, field: string): string =>
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
  return next.size === loading.size ? loading : next
}

const withoutLoading = (
  loading: ReadonlySet<string>,
  requests: ReadonlyArray<Requirement>,
): ReadonlySet<string> => {
  if (loading.size === 0) return loading
  const next = new Set(loading)
  for (const mark of fieldMarks(requests)) next.delete(mark)
  return next.size === loading.size ? loading : next
}

/**
 * A connection's mark. The leading separator keeps it out of the field marks'
 * space, whatever a connection identity happens to spell.
 */
const connectionPrefix = '\u0000connection\u0000'
export const connectionMark = (identity: string): string => `${connectionPrefix}${identity}`

/**
 * `loadingBy` once `by` has set `marks`: what it set before and is still
 * loading, and these. Itself without an owner, or when nothing changes.
 */
const ownedBy = (
  model: RemoteModel,
  by: string | undefined,
  marks: ReadonlyArray<string>,
): RemoteModel['loadingBy'] => {
  if (by === undefined) return model.loadingBy
  const before = model.loadingBy[by]
  const still = [...(before ?? [])].filter(mark => model.loading.has(mark))
  if (before !== undefined && still.length === before.size && marks.every(mark => before.has(mark)))
    return model.loadingBy
  return { ...model.loadingBy, [by]: new Set([...still, ...marks]) }
}

/** The marks `by` set that are still loading: what an answer has not cleared. */
export const ownedMarks = (model: RemoteModel, by: string): ReadonlyArray<string> =>
  [...(model.loadingBy[by] ?? [])].filter(mark => model.loading.has(mark))

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
const prunedLoading = (
  loading: ReadonlySet<string>,
  roots: RetentionRoots,
  reached: () => ReadonlySet<string>,
): ReadonlySet<string> => {
  if (loading.size === 0) return loading
  const named = new Set(roots.connections.map(root => connectionMark(root.identity)))
  // A field mark goes with its entity, exactly as a connection's goes with the
  // connection: a read the entry stopped waiting for must not leave a value
  // reading `Loading` with nothing fetching it.
  const kept = [...loading].filter(mark =>
    mark.startsWith(connectionPrefix) ? named.has(mark) : reached().has(markEntity(mark)),
  )
  return kept.length === loading.size ? loading : new Set(kept)
}

/**
 * The windows grown on connections retention keeps; a dropped one starts over.
 * The same record when every one is kept.
 */
const keptWindows = (
  grown: RemoteModel['grown'],
  connections: Retained['connections'],
): RemoteModel['grown'] => {
  const kept = Object.entries(grown).filter(([key]) =>
    Object.hasOwn(connections, key.slice(0, key.lastIndexOf('\u0000'))),
  )
  return kept.length === Object.keys(grown).length ? grown : Object.fromEntries(kept)
}

/** The placements awaiting a page of a list retention still keeps; a dropped list's page never comes. */
const keptByList = <Kept extends Readonly<Record<string, unknown>>>(
  placed: Kept,
  connections: Retained['connections'],
): Kept => {
  const kept = Object.entries(placed).filter(([key]) => Object.hasOwn(connections, key))
  return kept.length === Object.keys(placed).length ? placed : (Object.fromEntries(kept) as Kept)
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
  let at = refresh.floor
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
 * Marks connections as needing to be asked again, and restarts a read of them
 * already in flight: a page requested before what invalidated it could land
 * after it, saying what is no longer true. `Remote.refresh` marks the same way.
 */
export const invalidateConnections = (
  model: RemoteModel,
  connections: ReadonlyArray<string>,
  /** Why each goes stale, for `why`: one sentence for all, or one per identity. */
  because: string | ((connection: string) => string),
): RemoteModel => {
  if (connections.length === 0) return model
  const marked = connections.reduce(
    (current, connection) =>
      invalidated(current, connection, typeof because === 'string' ? because : because(connection)),
    model,
  )
  return { ...marked, refresh: withRefreshRequested(marked.refresh, [], connections) }
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

export const setConnectionStale = (
  connections: Readonly<Record<string, Connection>>,
  connection: string,
  stale: boolean,
): Readonly<Record<string, Connection>> => {
  const current = connections[connection]
  // A list no page answered is not made one by being called fresh: it would
  // read `Ready` with no rows.
  if (current?.stale === stale || (!stale && (current?.segments.length ?? 0) === 0))
    return connections
  return { ...connections, [connection]: { ...(current ?? emptyConnection), stale } }
}

/**
 * How many streams `live` and `streams` keep. Which streams the active
 * Surfaces hold is not in the Model (retention roots merge every Surface's
 * requirements, and a stream key is one entry's), so the ledger keeps those
 * most recently heard from, as `failed` keeps the latest failures. A stream
 * dropped while still open meets its next event as a gap, which restarts it
 * and refetches what it covers.
 */
const STREAM_WINDOW = 256

/** `record` with `stream` set as the most recent, the oldest dropped past the window. */
const heard = <V>(
  record: Readonly<Record<string, V>>,
  stream: string,
  value: V,
): Readonly<Record<string, V>> => {
  const { [stream]: _previous, ...rest } = record
  const next: Record<string, V> = { ...rest, [stream]: value }
  const keys = Object.keys(next)
  for (const key of keys.slice(0, Math.max(0, keys.length - STREAM_WINDOW))) delete next[key]
  return next
}

const withLiveState = (
  live: RemoteModel['live'],
  stream: string,
  state: LiveState,
): RemoteModel['live'] => (live[stream] === state ? live : heard(live, stream, state))

const noHealth: StreamHealth = {
  restarts: 0,
  failures: 0,
  error: Option.none(),
  refused: Option.none(),
}

/**
 * A stream broke: it is marked a gap and its restart count moves, which
 * restarts its live entry. A stream already broken and not yet restarted
 * changes nothing, so the events a dying stream still delivers restart it once.
 */
const broke = (
  model: RemoteModel,
  stream: string,
  error: Option.Option<RemoteError>,
): RemoteModel => {
  if (model.gaps.has(stream)) return model
  const health = model.streams[stream] ?? noHealth
  const streams = heard(model.streams, stream, {
    restarts: health.restarts + 1,
    failures: health.failures + 1,
    error,
    // An attempt after a refusal answered otherwise: the refusal no longer stands.
    refused: Option.none(),
  })
  // A gap is kept only beside its stream's health, which counts its restarts.
  const gaps = new Set([...model.gaps, stream].filter(key => Object.hasOwn(streams, key)))
  return { ...model, gaps, streams }
}

/** The tag of the server's refusal of a live stream, which `RemoteError` carries open. */
const refusedTag: RemoteLiveRefused['_tag'] = 'RemoteLiveRefused'

/**
 * The server refused a stream for what it asks: it is marked refused and not a
 * gap, so its live entry does not restart it, and the refusal is recorded as
 * a diagnostic once.
 */
const refused = (model: RemoteModel, stream: string, error: RemoteError): RemoteModel => {
  const health = model.streams[stream] ?? noHealth
  if (Option.isSome(health.refused)) return model
  const streams = heard(model.streams, stream, {
    ...health,
    error: Option.some(error),
    refused: Option.some(error),
  })
  return {
    ...clearGap(model, stream),
    streams,
    diagnostics: withDiagnostics(model.diagnostics, [liveRefused({ stream, error })]),
  }
}

/**
 * An event applied on a stream that resubscribed: it works, so its next break
 * backs off from the start. A broken stream's last events prove nothing.
 */
const healthy = (model: RemoteModel, stream: string): RemoteModel => {
  const health = model.streams[stream]
  // A refused stream that applies an event was opened again and admitted.
  const settled = health !== undefined && health.failures === 0 && Option.isNone(health.refused)
  return health === undefined || settled || model.gaps.has(stream)
    ? model
    : {
        ...model,
        streams: heard(model.streams, stream, {
          ...health,
          failures: 0,
          error: Option.none(),
          refused: Option.none(),
        }),
      }
}

const clearGap = (model: RemoteModel, stream: string): RemoteModel =>
  model.gaps.has(stream)
    ? { ...model, gaps: new Set([...model.gaps].filter(entry => entry !== stream)) }
    : model

/**
 * The pure reducer all four producers share, with what `capabilities` holds
 * installed: `updateRemote` with everything, a domain with what its
 * declarations brought. A live event that arrives ahead of its cursor is a
 * gap: it is not applied, and the stream is recorded so its live entry
 * restarts it rather than silently missing facts. When every field a Message
 * touches keeps its identity, `model` itself is returned, so the application's
 * root keeps its identity and Foldkit does not render. The common no-ops do (a
 * duplicate live event, a repeated `ReadStarted`); a repeated failure, or a
 * `preserve-existing` restore of entities already held, still makes an equal
 * copy.
 */
export const reduceIn = (
  capabilities: Capabilities,
  model: RemoteModel,
  message: RemoteMessage,
): RemoteModel => {
  const next = reduceRemote(capabilities, model, message)
  return next === model || !sameFields(model, next) ? next : model
}

/** Whether every field of `next` is the one `model` holds. */
const sameFields = (model: RemoteModel, next: RemoteModel): boolean => {
  const keys = Object.keys(next) as Array<keyof RemoteModel>
  return (
    keys.length === Object.keys(model).length && keys.every(key => Object.is(model[key], next[key]))
  )
}

const withoutChecking = (
  placed: RemoteModel['placed'],
  connection: string,
): RemoteModel['placed'] => {
  const order = placed[connection]
  return order?.checking === true
    ? { ...placed, [connection]: { ...order, checking: false } }
    : placed
}

/**
 * A placement compared with the server's first page of the list it placed
 * in, under `verifyPredictions`: the keys as far as both reach must agree, and
 * no row placing took out may be one the page still lists. The record goes
 * once compared; a disagreement is kept.
 */
const checkedPlacement = (
  model: RemoteModel,
  connection: string,
  page: { readonly edges: ReadonlyArray<{ readonly key: string }>; readonly start: Boundary },
  refreshes: boolean,
): Pick<RemoteModel, 'placed' | 'diagnostics'> => {
  const placed = model.placed[connection]
  if (placed === undefined || !refreshes || page.start._tag !== 'Terminal') {
    return { placed: model.placed, diagnostics: model.diagnostics }
  }
  const { [connection]: _, ...rest } = model.placed
  const reach = Math.min(placed.order.length, page.edges.length)
  const served = page.edges.slice(0, reach).map(edge => edge.key)
  const asPlaced = placed.order.slice(0, reach)
  const listed = new Set(page.edges.map(edge => edge.key))
  const agrees =
    served.every((key, index) => key === asPlaced[index]) &&
    !placed.dropped.some(key => listed.has(key))
  return {
    placed: rest,
    diagnostics: agrees
      ? model.diagnostics
      : withDiagnostics(model.diagnostics, [
          predictionMismatch(PredictionPart.Placement({ connection, placed: asPlaced, served })),
        ]),
  }
}

type MutationStartedMessage = Extract<RemoteMessage, { readonly _tag: 'MutationStarted' }>

/** The queue with `queued` in place of the entry of its operation, or after the rest. */
const placedIn = (queue: ReadonlyArray<Queued>, queued: Queued): ReadonlyArray<Queued> => {
  const operation = operationOf(queued)
  return queue.some(each => operationOf(each) === operation)
    ? queue.map(each => (operationOf(each) === operation ? queued : each))
    : [...queue, queued]
}

/** The echoes still awaited once a read asked at `now` answered `entities`: it is newer than an answer before it. */
const answeredSince = (
  echoes: RemoteModel['echoes'],
  entities: ReadonlyArray<{ readonly entity: string; readonly id: string }>,
  now: number,
): RemoteModel['echoes'] => {
  let next: Record<EntityKey, AwaitedEcho> | undefined
  for (const { entity, id } of entities) {
    const key = entityKey(entity, id)
    const echo = (next ?? echoes)[key]
    if (echo === undefined || echo.since > now) continue
    next ??= { ...echoes }
    delete next[key]
  }
  return next ?? echoes
}

/** `requests` marked to be read again, as `Data.refresh` marks them; none, the Model it was given. */
const askedAgain = (
  capabilities: Capabilities,
  model: RemoteModel,
  requests: ReadonlyArray<Requirement>,
): RemoteModel => {
  if (requests.every(request => request.fields.length === 0)) return model
  const marked = reduceRemote(capabilities, model, { _tag: 'RefreshStarted', requests })
  return { ...marked, refresh: withRefreshRequested(marked.refresh, requests) }
}

/**
 * Whether an answer was asked for before the last `forget`, so is the previous
 * principal's (#484). Foldkit restarts a Subscription after the Messages
 * already queued, so interrupting the old read does not stop its answer.
 */
const askedBeforeForget = (model: RemoteModel, generation: number | undefined): boolean =>
  generation !== undefined && generation < model.refresh.floor

/**
 * The outbox having heard whom an answer was for. Itself when the answer did
 * not say, said what it holds, or answers a request sent before the last
 * `forget` (its `generation` below `refresh.floor`), which was someone else's.
 */
const heardAs = (
  model: RemoteModel,
  outbox: OutboxState,
  heard: MadeAs | undefined,
  generation: number | undefined,
): OutboxState => {
  if (heard === undefined || generation === undefined || askedBeforeForget(model, generation)) {
    return outbox
  }
  const same = Option.exists(outbox.principal, held =>
    Match.valueTags(held, {
      Visitor: () => heard._tag === 'Visitor',
      Signed: ({ key }) => heard._tag === 'Signed' && heard.key === key,
    }),
  )
  const owner = ownerAfter(outbox.owner, heard)
  return same && owner === outbox.owner
    ? outbox
    : { ...outbox, principal: Option.some(heard), owner }
}

/** A durable write queued to wait its turn: new, or a failed one retried, its revision moved on. */
const queuedWrite = (
  outbox: OutboxState,
  operation: string,
  write: NonNullable<MutationStartedMessage['write']>,
  message: MutationStartedMessage,
): OutboxState => {
  const prior = outbox.queue.find(queued => operationOf(queued) === operation)
  const stored: StoredWrite = {
    operation,
    mutation: write.mutation,
    input: write.durable?.input,
    ...(write.keys === undefined ? {} : { keys: write.keys }),
    ...(write.now === undefined ? {} : { now: write.now }),
    optimistic: message.optimistic ?? [],
    ...(message.viewer === undefined ? {} : { viewer: message.viewer }),
    // A write retried keeps who it was made for; a new one is whom the server last named.
    ...Option.match(
      prior === undefined
        ? stampOf(outbox)
        : Queued.$match(prior, {
            Readable: ({ write: queued }) => Option.fromUndefinedOr(queued.madeAs),
            Unreadable: () => stampOf(outbox),
          }),
      { onNone: () => ({}), onSome: madeAs => ({ madeAs }) },
    ),
    shown: write.durable?.shown ?? [],
    ...(write.durable?.lists === undefined ? {} : { lists: write.durable.lists }),
    revision: prior === undefined ? 0 : revisionOf(prior) + 1,
    state: { _tag: 'Waiting' },
  }
  return {
    ...outbox,
    queue: placedIn(
      outbox.queue,
      Queued.Readable({ write: stored, stored: false, attempt: 0, delayed: Option.none() }),
    ),
  }
}

/** The outbox with the readable write of `operation` changed by `change`; itself when it has none. */
const withQueued = (
  outbox: OutboxState,
  operation: string,
  change: (queued: Extract<Queued, { readonly _tag: 'Readable' }>) => Queued,
): OutboxState => {
  const at = outbox.queue.findIndex(queued => operationOf(queued) === operation)
  const queued = outbox.queue[at]
  if (queued?._tag !== 'Readable') return outbox
  const queue = outbox.queue.map((each, index) => (index === at ? change(queued) : each))
  return { ...outbox, queue }
}

/** The outbox with `operation` settled: out of the queue, and remembered as done. */
const withoutQueued = (outbox: OutboxState, operation: string): OutboxState =>
  outbox.queue.some(queued => operationOf(queued) === operation)
    ? {
        ...outbox,
        queue: outbox.queue.filter(queued => operationOf(queued) !== operation),
        done: withDone(outbox.done, [operation]),
      }
    : outbox

const storedAs = (queued: Queued, stored: boolean): Queued =>
  queued.stored === stored ? queued : { ...queued, stored }

/** A stored entry as the queue holds it: in the store, as read. */
const queuedOf = (entry: ReadEntry): Queued =>
  Match.valueTags(entry, {
    Readable: ({ write }) =>
      Queued.Readable({ write, stored: true, attempt: 0, delayed: Option.none() }),
    Unreadable: ({ operation, revision, raw, reason }) =>
      Queued.Unreadable({ operation, revision, raw, reason, stored: true }),
  })

const entryOperation = (entry: ReadEntry): string =>
  Match.valueTags(entry, {
    Readable: ({ write }) => write.operation,
    Unreadable: ({ operation }) => operation,
  })

const entryRevision = (entry: ReadEntry): number =>
  Match.valueTags(entry, {
    Readable: ({ write }) => write.revision,
    Unreadable: ({ revision }) => revision,
  })

/** Whether a stored write's state keeps it in the ledger in flight, its layer shown. */
const waitingIn = (state: StoredWrite['state']): boolean =>
  Match.valueTags(state, {
    Waiting: () => true,
    WaitingForSignIn: () => true,
    Failed: () => false,
  })

/** Whether the queued write waits, its turn or a sign-in: in the ledger in flight, its layer shown. */
const isWaiting = (queued: Queued): boolean =>
  queued._tag === 'Readable' && waitingIn(queued.write.state)

/** The ledger and layers without a queued write: nothing of it shown or listed. */
const releasedFrom = (
  capabilities: Capabilities,
  model: RemoteModel,
  queued: Queued,
): RemoteModel => {
  const operation = operationOf(queued)
  if (!model.mutations.pending.has(operation)) {
    return { ...model, mutations: forgetFailure(model.mutations, operation) }
  }
  const pending = new Set(model.mutations.pending)
  pending.delete(operation)
  const writes = new Map(model.mutations.writes)
  writes.delete(operation)
  // No answer of it is awaited here, so nothing is held back for one.
  const order = new Map(model.mutations.order)
  order.delete(operation)
  return {
    ...model,
    kept: pending.size === 0 ? noKept : model.kept,
    mutations: { ...model.mutations, pending, writes, order },
    optimistic: layersIn(capabilities).settleFailure(model.optimistic, operation),
  }
}

/** The row whose create an operation moves counts for (`PendingPatch.creates`), if any. */
const createdBy = (operation: OptimisticOperation): Option.Option<EntityKey> =>
  isPatch(operation) && operation.creates !== undefined
    ? Option.some(entityKey(operation.creates.entity, operation.creates.id))
    : Option.none()

/** Whether `store` holds, live, the row whose create `operation` counts. */
const createdIn = (store: EntityStore, operation: OptimisticOperation): boolean =>
  Option.exists(createdBy(operation), key => store[key]?.tombstone === false)

/**
 * Whether the row `operation` moves its counts on was read no earlier than
 * `at`, the write's time: a count read before it may predate the row the
 * write made, so it still takes the increment (#457). A write with no time to
 * judge by is taken to have been counted, as before (#410).
 */
const countedIn = (
  store: EntityStore,
  operation: OptimisticOperation,
  at: Option.Option<number>,
): boolean =>
  !isPatch(operation) ||
  Option.match(at, {
    onNone: () => true,
    onSome: now => (store[entityKey(operation.entity, operation.id)]?.updatedAt ?? 0) >= now,
  })

/** `operation` without the counts a create moves, when the store already counted its row. */
const uncounted = (operation: OptimisticOperation): OptimisticOperation => {
  if (!isPatch(operation) || operation.creates === undefined) return operation
  const { adds: _adds, creates: _creates, ...rest } = operation
  return rest
}

/**
 * The ledger and layers with a stored entry adopted in place of what the
 * page held of it (`prior`): a write waiting is begun, its layer shown; one
 * failed is failed, its layer gone; one this version cannot read is not in
 * the ledger at all.
 */
const adopted = (
  capabilities: Capabilities,
  model: RemoteModel,
  prior: Queued | undefined,
  entry: ReadEntry,
): RemoteModel => {
  // Waiting either side of a sign-in, a write is the same write: its layer
  // keeps its place under the writes after it, which a new begin would lose.
  if (
    prior !== undefined &&
    isWaiting(prior) &&
    entry._tag === 'Readable' &&
    waitingIn(entry.write.state)
  ) {
    return model
  }
  const released = prior === undefined ? model : releasedFrom(capabilities, model, prior)
  if (entry._tag === 'Unreadable') return released
  const { write } = entry
  const at = Option.fromUndefinedOr(write.now)
  // A store holding the row a restored create makes read its counts with it there: the
  // server ran the write before this page read them (#410), unless it read them
  // before the write, when they may predate the row (#457).
  const alreadyCounted = (operation: OptimisticOperation): boolean =>
    createdIn(released.entities, operation) && countedIn(released.entities, operation, at)
  const optimistic = write.optimistic.map(operation =>
    alreadyCounted(operation) ? uncounted(operation) : operation,
  )
  const begun = {
    ...released,
    mutations: beginMutation(released.mutations, write.operation, {
      mutation: write.mutation,
      input: entry.input,
      keys: write.keys,
      now: at,
      optimistic,
    }),
  }
  const shown = (): RemoteModel => ({
    ...begun,
    optimistic: layersIn(capabilities).begin(
      begun.optimistic,
      write.operation,
      optimistic,
      Option.fromUndefinedOr(write.viewer),
    ),
  })
  return Match.valueTags(write.state, {
    Waiting: shown,
    WaitingForSignIn: shown,
    Failed: ({ error }) => ({
      ...begun,
      mutations: failMutation(begun.mutations, write.operation, error, write.operation),
    }),
  })
}

/**
 * Writes another tab settled, whose answers this page did not see: their
 * layers go, every row they showed is asked for again and every list is
 * refetched, since what the server made of them is not known here.
 */
const settledElsewhere = (
  capabilities: Capabilities,
  model: RemoteModel,
  settled: ReadonlyArray<Queued>,
): RemoteModel => {
  const released = settled.reduce(
    (current, queued) => releasedFrom(capabilities, current, queued),
    model,
  )
  const rows = new Map<string, { readonly entity: string; readonly id: string }>()
  for (const queued of settled) {
    if (queued._tag !== 'Readable' || !isWaiting(queued)) continue
    for (const operation of queued.write.optimistic) {
      if ('entity' in operation) rows.set(entityKey(operation.entity, operation.id), operation)
    }
  }
  if (!settled.some(isWaiting)) return released
  const requests = [...rows.entries()].flatMap(([key, row]) =>
    Option.match(storeEntry(released.entities, key), {
      onNone: () => [],
      onSome: held =>
        held.present.size === 0
          ? []
          : [{ entity: row.entity, id: row.id, fields: [...held.present] }],
    }),
  )
  const asked =
    requests.length === 0
      ? released
      : reduceRemote(capabilities, released, { _tag: 'RefreshStarted', requests })
  return invalidateConnections(
    asked,
    Object.keys(asked.connections),
    'a write another tab settled may have changed it',
  )
}

/**
 * What the store holds, met by what the page holds: an entry the store has a
 * newer revision of is adopted, one it has as the page does is marked
 * stored, one it lacks is written again, and one it settled goes. A read
 * under another key replaces the page's queue (its writes stay in their own
 * store). The Model itself when nothing changed.
 */
const readOutbox = (
  capabilities: Capabilities,
  model: RemoteModel,
  message: Extract<RemoteMessage, { readonly _tag: 'OutboxRead' }>,
): RemoteModel => {
  const switching =
    (Option.isSome(model.outbox.key) && model.outbox.key.value !== message.key) ||
    (Option.isSome(model.outbox.scope) && model.outbox.scope.value !== message.scope)
  const start: RemoteModel = switching
    ? {
        ...model.outbox.queue.reduce(
          (current, queued) => releasedFrom(capabilities, current, queued),
          model,
        ),
        outbox: { ...model.outbox, queue: [], done: [] },
      }
    : model
  const before = start.outbox
  const done = withDone(before.done, message.done)
  const gone = new Set(done)
  const held = new Map(before.queue.map(queued => [operationOf(queued), queued]))
  const read = new Set<string>()
  const queue: Queued[] = []
  const recorded: RemoteDiagnostic[] = []
  let next = start
  for (const entry of message.entries) {
    const operation = entryOperation(entry)
    if (gone.has(operation) || read.has(operation)) continue
    read.add(operation)
    const prior = held.get(operation)
    const revision = entryRevision(entry)
    // The page's copy is newer: the store has not caught up, and is written again.
    if (prior !== undefined && revisionOf(prior) > revision) queue.push(prior)
    else if (prior !== undefined && revisionOf(prior) === revision) {
      queue.push(storedAs(prior, true))
    } else {
      next = adopted(capabilities, next, prior, entry)
      if (entry._tag === 'Unreadable' && prior === undefined) {
        recorded.push(outboxUnreadable({ requestId: operation, reason: entry.reason }))
      }
      queue.push(queuedOf(entry))
    }
  }
  const settled: Queued[] = []
  for (const queued of before.queue) {
    const operation = operationOf(queued)
    if (read.has(operation)) continue
    if (gone.has(operation)) settled.push(queued)
    else queue.push(storedAs(queued, false))
  }
  next = settledElsewhere(capabilities, next, settled)
  // Said once a page: every save after fails alike until storage frees up.
  const said = next.diagnostics.some(
    diagnostic => diagnostic._tag === 'OutboxUnsaved' && diagnostic.key === message.key,
  )
  if (message.unsaved !== undefined && !said) {
    recorded.push(outboxUnsaved({ key: message.key, reason: message.unsaved }))
  }
  const session = Option.orElse(before.session, () => Option.fromUndefinedOr(message.session))
  const stored = Option.fromUndefinedOr(message.owner)
  // The queue's owner: the new one's alone, after a move to another queue.
  const owner = switching ? stored : ownerOf(before.owner, stored)
  // A page that has heard no one yet takes the queue's owner as whom it heard.
  const principal = Option.isSome(before.principal) ? before.principal : stored
  const unchanged =
    !switching &&
    next === start &&
    recorded.length === 0 &&
    done === before.done &&
    Option.contains(before.key, message.key) &&
    Option.contains(before.scope, message.scope) &&
    Option.isSome(before.session) === Option.isSome(session) &&
    (Option.isNone(owner) ? Option.isNone(before.owner) : owner === before.owner) &&
    queue.length === before.queue.length &&
    queue.every((queued, index) => queued === before.queue[index])
  if (unchanged) return model
  return {
    ...next,
    outbox: {
      session,
      key: Option.some(message.key),
      scope: Option.some(message.scope),
      queue,
      done,
      principal,
      owner,
      left: switching ? leftOf(model.outbox) : before.left,
    },
    diagnostics: withDiagnostics(next.diagnostics, recorded),
  }
}

/**
 * The Remote Model with a failed or unreadable durable write settled by the
 * reader (`Data.dismiss`): out of the queue and the ledger, and done, so every
 * tab drops it. A waiting one, or one not queued, is the Model itself.
 */
export const dismissQueued = (model: RemoteModel, requestId: string): RemoteModel => {
  const queued = model.outbox.queue.find(each => operationOf(each) === requestId)
  if (queued === undefined || isWaiting(queued)) return model
  return {
    ...model,
    mutations: forgetFailure(model.mutations, requestId),
    outbox: withoutQueued(model.outbox, requestId),
  }
}

/**
 * The Remote Model with every write waiting for a sign-in waiting its turn
 * again (`Data.signedIn`), its revision moved on, so the store and every tab
 * take it and the outbox sends it, then those held behind it. The Model
 * itself when none waits for one.
 */
export const signedInQueued = (model: RemoteModel): RemoteModel => {
  const waitsForSignIn = (
    queued: Queued,
  ): queued is Extract<Queued, { readonly _tag: 'Readable' }> =>
    queued._tag === 'Readable' && queued.write.state._tag === 'WaitingForSignIn'
  if (!model.outbox.queue.some(waitsForSignIn)) return model
  return {
    ...model,
    outbox: {
      ...model.outbox,
      queue: model.outbox.queue.map(queued =>
        waitsForSignIn(queued)
          ? Queued.Readable({
              write: {
                ...queued.write,
                revision: queued.write.revision + 1,
                state: { _tag: 'Waiting' },
              },
              stored: false,
              attempt: 0,
              delayed: Option.none(),
            })
          : queued,
      ),
    },
  }
}

const reduceRemote = (
  capabilities: Capabilities,
  model: RemoteModel,
  message: RemoteMessage,
): RemoteModel => {
  switch (message._tag) {
    case 'Preloaded':
      return message.messages.reduce(
        (reduced, heard) => reduceRemote(capabilities, reduced, heard),
        model,
      )
    case 'CompletedReportDiagnostics':
      return model
    case 'ReadReceived': {
      if (askedBeforeForget(model, message.generation)) return model
      const { held, confirmed } = readAfter(
        model.entities,
        message.requests,
        message.result,
        message.after,
      )
      return {
        ...model,
        outbox: heardAs(
          model,
          model.outbox,
          message.result.principal === undefined ? undefined : madeAsOf(message.result.principal),
          message.generation,
        ),
        entities: clearFloors(
          writeRead(model.entities, message.requests, message.result, message.now, held),
          confirmed,
        ),
        echoes: answeredSince(
          model.echoes,
          held.size === 0
            ? message.result.entities
            : message.result.entities.filter(row => !held.has(entityKey(row.entity, row.id))),
          message.now,
        ),
        loading: withoutLoading(model.loading, message.requests),
        // What was asked, and what came back: a relation riding on the request
        // writes its targets too, and a target's old failure must not outlive
        // the value that answers it.
        failures: withoutFieldFailures(model.failures, [
          ...fieldMarks(message.requests),
          ...patchedMarks(message.result.entities),
        ]),
      }
    }
    case 'ReadFailed':
      if (askedBeforeForget(model, message.generation)) return model
      // A broken live stream is not a failed read. Marking its fields failed
      // would take them out of the read entry's plan, and restart it, which is
      // the opposite of what missing changes calls for.
      if (message.stream !== undefined) {
        // tag-check: open — a RemoteError carries any transport failure's tag.
        return message.error._tag === refusedTag
          ? refused(model, message.stream, message.error)
          : broke(model, message.stream, Option.some(message.error))
      }
      // The read is over. Fields it refreshed read as they did, and every field
      // it asked for carries the error until something settles it.
      return {
        ...model,
        entities: setStale(model.entities, marksOf(message.requests), false),
        loading: withoutLoading(model.loading, message.requests),
        failures: withFieldFailures(model.failures, message.requests, message.error),
      }
    case 'RetentionChanged': {
      const { recent, evicted } = budgeted(
        model.recent,
        message.roots,
        model,
        message.budget ?? defaultBudget,
      )
      const retained = gc(model, heldRoots(recent))
      const { connections, history } = heldForGoingBack(model.history, retained.connections, {
        departed: recent.departed.flatMap(batch => batch.connections),
        shown: message.roots.connections,
        now: message.now,
        window: message.historyWindow ?? defaultHistoryWindow,
      })
      // Retention's own walk over the Model before collection. It counts a
      // relation's target and a list's row the store does not hold, which is
      // exactly a value whose first read failed or is still in flight.
      let reachedKeys: ReadonlySet<string> | undefined
      const reached = () =>
        (reachedKeys ??= reachable(
          model.entities,
          message.roots,
          model.connections,
          model.optimistic,
          model.mutations.pending,
        ))
      return {
        ...model,
        ...retained,
        connections,
        history,
        recent,
        evicted:
          evicted.connections.length === 0 && evicted.requirements.length === 0
            ? model.evicted
            : {
                connections: remembered(
                  model.evicted.connections,
                  evicted.connections.map(root => root.identity),
                ),
                rows: remembered(
                  model.evicted.rows,
                  evicted.requirements.map(root => entityKey(root.entity, root.id)),
                ),
              },
        grown: keptWindows(model.grown, retained.connections),
        placed: keptByList(model.placed, retained.connections),
        // A collected list's reason goes with it.
        staleBecause: keptByList(model.staleBecause, retained.connections),
        refresh: prunedRefresh(model.refresh, retained),
        failures: prunedFailures(model.failures, message.roots, reached),
        loading: prunedLoading(model.loading, message.roots, reached),
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
              receivedAt: own(message.receivedAt, identity) ?? 0,
            },
          ] as const,
      )
      // A restored value is a write like any other, and settles a failure on the
      // field it writes: every field under `replace`, and only fields of
      // entities the store did not hold under `preserve-existing`.
      const written = Object.entries(message.entities).flatMap(([key, entry]) =>
        message.merge === 'replace' || !(key in model.entities)
          ? [...entry.present].map(field => `${key}\u0000${field}`)
          : [],
      )
      return {
        ...model,
        entities: mergeStores(model.entities, message.entities, message.merge),
        failures: withoutFieldFailures(model.failures, written),
        connections:
          restored.length === 0
            ? model.connections
            : message.merge === 'replace'
              ? { ...model.connections, ...Object.fromEntries(restored) }
              : { ...Object.fromEntries(restored), ...model.connections },
        restoredFrom: message.from === undefined ? model.restoredFrom : Option.some(message.from),
      }
    }
    case 'RefreshStarted': {
      // An entity known to be absent stays so while it is asked about again,
      // so the rows and reads it took away stay away until the answer (#263).
      // A field the server settled without a value is asked for again, and
      // reads `Loading` while it is.
      const marks = marksOf(message.requests)
      const entities = setUnavailable(
        setStale(askAgain(model.entities, marks), marks, true),
        marks,
        false,
      )
      // Asking again is also how a failed field is retried, including one that
      // never loaded and so has nothing to mark stale, and one on a relation's
      // target, which the request reaches only through the store: a server need
      // not expand a relation, and the target is then planned by id once more.
      const reached = reachedMarks(model.entities, message.requests)
      const failures = withoutFieldFailures(model.failures, reached)
      // A failed field reads `Loading` from here, not `Initial`, until its read
      // lands: a retry keeps the failure's place. The mark takes the failure's,
      // so the same roots prune it.
      const retried = reached.filter(mark => mark in model.failures.fields)
      const loading = retried.length === 0 ? model.loading : new Set([...model.loading, ...retried])
      // A list is asked again whole, so it reads `Refreshing` with its rows and
      // the page answering it replaces them. One the Model does not hold has
      // nothing to show, and stays as it is.
      const connections = (message.connections ?? []).reduce(
        (held, identity) =>
          (held[identity]?.segments.length ?? 0) === 0
            ? held
            : setConnectionStale(held, identity, true),
        model.connections,
      )
      return {
        ...model,
        entities,
        failures,
        loading,
        connections,
        history: withoutHolds(model.history, message.connections ?? []),
      }
    }
    case 'Navigated':
      return {
        ...model,
        history: {
          ...model.history,
          navigations: model.history.navigations + 1,
          last: message.kind,
        },
      }
    case 'QueryStarted': {
      const marks = message.connections.map(connectionMark)
      const loading = new Set([...model.loading, ...marks])
      const loadingBy = ownedBy(model, message.by, marks)
      return loading.size === model.loading.size && loadingBy === model.loadingBy
        ? model
        : { ...model, loading, loadingBy }
    }
    case 'ReadStarted':
      return {
        ...model,
        loading: withLoading(model.loading, message.requests),
        loadingBy: ownedBy(model, message.by, [...fieldMarks(message.requests)]),
        refresh: withRefreshStarted(model.refresh, message.requests, message.refresh),
      }
    case 'ReadAbandoned': {
      const others = Object.entries(model.loadingBy).filter(([by]) => by !== message.by)
      const kept = new Set(message.marks.filter(mark => others.some(([, set]) => set.has(mark))))
      const loading = new Set(model.loading)
      for (const mark of message.marks) if (!kept.has(mark)) loading.delete(mark)
      const { [message.by]: _abandoned, ...loadingBy } = model.loadingBy
      return { ...model, loading, loadingBy }
    }
    case 'MutationStarted':
      return {
        ...model,
        outbox:
          message.write?.durable === undefined
            ? model.outbox
            : queuedWrite(model.outbox, message.requestId, message.write, message),
        mutations: beginMutation(
          model.mutations,
          message.requestId,
          message.write === undefined
            ? undefined
            : {
                mutation: message.write.mutation,
                input: message.write.input,
                keys: message.write.keys,
                now: Option.fromUndefinedOr(message.write.now),
                optimistic: message.optimistic ?? [],
              },
        ),
        optimistic: layersIn(capabilities).begin(
          model.optimistic,
          message.requestId,
          message.optimistic ?? [],
          Option.fromUndefinedOr(message.viewer),
        ),
      }
    case 'MutationSucceeded': {
      // Settling is release-the-layer-and-overlays, so overlapping optimistic
      // layers rebase instead of needing inverse patches.
      const settled = layersIn(capabilities).settleSuccess(
        model.entities,
        model.optimistic,
        model.mutations,
        message.requestId,
        message,
      )
      // What the answer read lands with it, so no frame shows the row without
      // a field the layer showed. A repeated answer writes nothing, read included,
      // and the read leaves what a later request settled, as the patch does.
      const read =
        message.read === undefined || model.mutations.applied.has(message.requestId)
          ? undefined
          : unsettledRead(message.read, settledLater(model.mutations, message.requestId))
      // A live stream may still send what was committed before this write;
      // until it sends the answer's values back, it does not overwrite them.
      const echoes = model.mutations.applied.has(message.requestId)
        ? model.echoes
        : Option.match(capabilities.live, {
            onNone: () => model.echoes,
            onSome: live =>
              live.awaitEchoes(
                model.echoes,
                [...message.entities, ...(read?.result.entities ?? [])],
                message.now,
              ),
          })
      // What a stream wrote while this was pending ends here; one that disagrees with
      // the answer is read again, as only a read says which is the newer (#499).
      const answered = [...message.entities, ...(read?.result.entities ?? [])]
      const { kept, again } = model.mutations.applied.has(message.requestId)
        ? { kept: model.kept, again: [] }
        : Option.match(capabilities.live, {
            onNone: () => ({ kept: model.kept, again: [] }),
            onSome: live =>
              live.settleKept(
                model.kept,
                model.entities,
                message.requestId,
                answered,
                settled.state.pending,
                message.now,
              ),
          })
      const repeated = model.mutations.applied.has(message.requestId)
      const written =
        read === undefined
          ? settled.store
          : writeRead(
              settled.store,
              read.requests,
              read.result,
              message.now,
              rowsOf(read.result.behind),
            )
      const next: RemoteModel = {
        ...model,
        entities:
          message.after === undefined || repeated
            ? written
            : setFloors(
                written,
                message.after.rows.map(row => ({
                  key: entityKey(row.entity, row.id),
                  token: message.after!.token,
                })),
              ),
        echoes,
        kept,
        mutations: settled.state,
        outbox: heardAs(
          model,
          withoutQueued(model.outbox, message.requestId),
          message.principal,
          message.generation,
        ),
        optimistic: settled.optimistic,
        failures: withoutFieldFailures(model.failures, [
          ...(read === undefined
            ? []
            : [...fieldMarks(read.requests), ...patchedMarks(read.result.entities)]),
          ...patchedMarks(message.entities),
          ...(message.deleted ?? []).flatMap(ref =>
            entityFailureMarks(model.failures, entityKey(ref.entity, ref.id)),
          ),
        ]),
      }
      return askedAgain(capabilities, next, again)
    }
    case 'MutationQueued':
    case 'OutboxMoved':
    case 'OutboxHeld':
      return model
    case 'OutboxDelayed':
      return {
        ...model,
        outbox: withQueued(model.outbox, message.requestId, queued =>
          Queued.Readable({
            ...queued,
            attempt: message.attempt,
            delayed: Option.some(message.error),
          }),
        ),
      }
    case 'OutboxRead':
      return readOutbox(capabilities, model, message)
    case 'OverlayShown': {
      const layers = layersIn(capabilities)
      return {
        ...model,
        optimistic: layers.begin(
          layers.settleFailure(model.optimistic, overlayLayer(message.id)),
          overlayLayer(message.id),
          message.optimistic,
        ),
      }
    }
    case 'WindowGrown':
      return { ...model, grown: { ...model.grown, [message.window]: message.size } }
    case 'OverlayLifted': {
      const optimistic = layersIn(capabilities).settleFailure(
        model.optimistic,
        overlayLayer(message.id),
      )
      return optimistic.layers.length === model.optimistic.layers.length &&
        optimistic.overlays.length === model.optimistic.overlays.length
        ? model
        : { ...model, optimistic }
    }
    case 'MutationFailed': {
      const mutations = failMutation(
        model.mutations,
        message.requestId,
        message.error,
        message.operation,
      )
      return {
        ...model,
        kept: mutations.pending.size === 0 ? noKept : model.kept,
        // Only a write in flight fails: a repeated failure moves nothing on.
        outbox: !model.mutations.pending.has(message.requestId)
          ? model.outbox
          : withQueued(model.outbox, message.requestId, queued =>
              Queued.Readable({
                write: {
                  ...queued.write,
                  revision: queued.write.revision + 1,
                  state: { _tag: 'Failed', error: message.error },
                },
                stored: false,
                attempt: 0,
                delayed: Option.none(),
              }),
            ),
        mutations,
        optimistic: layersIn(capabilities).settleFailure(model.optimistic, message.requestId),
      }
    }
    case 'LiveReceived': {
      if (askedBeforeForget(model, message.generation)) return model
      const state = model.live[message.stream] ?? emptyLiveState
      if (message.event._tag === 'EntityPatched' || message.event._tag === 'EntityDeleted') {
        const event = message.event
        const applied = liveIn(capabilities).applyEntity(state, model.entities, event, {
          now: message.now,
          stream: message.stream,
          echoes: model.echoes,
          kept: model.kept,
          pending: model.mutations.pending,
        })
        if (applied.outcome === 'gap') return broke(model, message.stream, Option.none())
        // A value the server sent is newer than any failure to fetch it.
        const settled =
          applied.outcome !== 'applied'
            ? []
            : Match.valueTags(event, {
                EntityPatched: patched => [
                  ...patchedMarks([{ ...patched.ref, values: applied.written }]),
                ],
                EntityDeleted: deleted =>
                  entityFailureMarks(model.failures, entityKey(deleted.ref.entity, deleted.ref.id)),
              })
        const next = {
          ...model,
          entities: applied.store,
          live: withLiveState(model.live, message.stream, applied.state),
          failures: withoutFieldFailures(model.failures, settled),
          echoes: applied.echoes,
          kept: applied.kept,
        }
        if (applied.outcome !== 'applied') return next
        // What it contradicted is read again: a read asked now says which is
        // the server's, and ends the wait.
        return askedAgain(capabilities, healthy(next, message.stream), [
          { ...event.ref, fields: [...applied.contradicted] },
        ])
      }
      const applied = liveIn(capabilities).applyConnection(
        state,
        model.optimistic,
        message.event,
        message.policy,
      )
      if (applied.outcome === 'gap') return broke(model, message.stream, Option.none())
      const written = {
        ...model,
        optimistic: applied.optimistic,
        live: withLiveState(model.live, message.stream, applied.state),
      }
      const next = applied.outcome === 'applied' ? healthy(written, message.stream) : written
      // An invalidating event means exactly what `ConnectionInvalidated` means,
      // so it goes through the same reduction rather than a parallel one.
      return applied.invalidated === undefined
        ? next
        : invalidateConnections(next, [applied.invalidated], 'its live stream asked for it again')
    }
    case 'GapCleared':
      return clearGap(model, message.stream)
    case 'ConnectionMerged': {
      if (askedBeforeForget(model, message.generation)) return model
      const current = model.connections[message.connection] ?? emptyConnection
      const loading = withoutQueryLoading(model.loading, message.connection)
      // The page answering an invalidation is the server's list as it now is, so it
      // replaces the pages: removed and reordered items go, and later pages are paged
      // again. A re-run of a connection that was not invalidated still merges.
      const replaces = message.refreshes === true && current.stale
      const merged = merge(replaces ? emptyConnection : current, message.page)
      // A page answering the list whole dates it; a later page leaves the rows
      // before it as old as they were.
      const receivedAt =
        message.now !== undefined && (replaces || current.segments.length === 0)
          ? message.now
          : current.receivedAt
      // A query payload writes like a read: one synthetic request per matching
      // edge, so windows, nested relations and settled fields behave as they do
      // for `ReadReceived`. A page without a payload only merges the connection.
      // Entities without a select are unsolicited and ignored: there is nowhere
      // to write them, and they must not clear failures they do not answer.
      const payload = message.select === undefined ? [] : (message.entities ?? [])
      const settled = message.select === undefined ? [] : (message.settled ?? [])
      const requests =
        message.select === undefined || (payload.length === 0 && settled.length === 0)
          ? []
          : message.page.edges
              .filter(edge => edge.ref.entity === message.select!.entity)
              .map(edge => ({ ...message.select!, id: edge.ref.id }))
      const payloadRead = { entities: [...payload], settled: [...settled] }
      // A page is read with no token: a floored row on it may be older than the write.
      const entities =
        requests.length === 0
          ? model.entities
          : writeRead(
              model.entities,
              requests,
              payloadRead,
              message.now ?? 0,
              readAfter(model.entities, requests, payloadRead, undefined).held,
            )
      // Like `ReadReceived`: the answer settles what it was asked, whether
      // with values or as settled, so a prior failure does not outlive it.
      const failures = withoutFieldFailures(
        withoutConnectionFailure(model.failures, message.connection),
        [...fieldMarks(requests), ...patchedMarks(payload)],
      )
      return {
        ...model,
        ...checkedPlacement(model, message.connection, message.page, message.refreshes === true),
        entities,
        connections: {
          ...model.connections,
          [message.connection]:
            message.refreshes === true
              ? { ...merged, stale: false, receivedAt }
              : receivedAt === merged.receivedAt
                ? merged
                : { ...merged, receivedAt },
        },
        // No overlay, nothing to prune: a read-only domain has no layer code.
        optimistic:
          model.optimistic.overlays.length === 0
            ? model.optimistic
            : layersIn(capabilities).pruneOverlays(
                model.optimistic,
                message.connection,
                new Set(message.page.edges.map(edge => edge.key)),
                model.mutations.pending,
              ),
        failures,
        loading,
        outbox: heardAs(model, model.outbox, message.principal, message.generation),
      }
    }
    case 'ConnectionInvalidated':
      return invalidated(model, message.connection, 'it was refreshed (Data.refresh)')
    case 'QueryFailed':
      if (askedBeforeForget(model, message.generation)) return model
      // The pages stay as they were, and a refresh that failed is still owed:
      // the connection stays stale. The failure is what stops the planner
      // asking again on its own; whatever settles it next (a retry, or a page
      // from "load more") leaves the connection due, so the refresh then runs
      // rather than a later page quietly passing for current.
      return {
        ...model,
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

/** `history` without the holds on `identities`; itself when it held none of them. */
const withoutHolds = (
  history: NavigationHistory,
  identities: ReadonlyArray<string>,
): NavigationHistory => {
  const dropped = identities.filter(identity => Object.hasOwn(history.held, identity))
  if (dropped.length === 0) return history
  const held = { ...history.held }
  for (const identity of dropped) delete held[identity]
  return { ...history, held }
}

/**
 * The lists retention holds for going back, once `departed` are the lists of
 * Surfaces left and `shown` those of the active ones.
 *
 * A list left is marked stale, so going back refetches it, unless its age
 * already says when it is due. Left fresh at `now`, it is also held until
 * `window` after: a history navigation back within that reads it as it was,
 * and asks for nothing. A list shown again ends its hold, fresh again if the
 * hold kept it, stale otherwise; a hold on a list retention dropped ends too.
 */
const heldForGoingBack = (
  history: NavigationHistory,
  retained: Readonly<Record<string, Connection>>,
  lists: {
    readonly departed: ReadonlyArray<ConnectionRoot>
    readonly shown: ReadonlyArray<ConnectionRoot>
    readonly now: number | undefined
    readonly window: number
  },
): {
  readonly connections: Readonly<Record<string, Connection>>
  readonly history: NavigationHistory
} => {
  const { now } = lists
  let connections = retained
  const held: Record<string, HistoryHold> = {}
  for (const [identity, hold] of Object.entries(history.held))
    if (Object.hasOwn(retained, identity)) held[identity] = hold
  for (const { identity } of lists.shown) {
    const hold = held[identity]
    if (hold === undefined) continue
    if (now !== undefined && now < hold.until && heldForHistory(history, connections, identity))
      connections = setConnectionStale(connections, identity, false)
    delete held[identity]
  }
  for (const { identity, ages } of lists.departed) {
    const current = connections[identity]
    if (current === undefined || ages === true || current.stale) continue
    connections = setConnectionStale(connections, identity, true)
    if (now !== undefined)
      held[identity] = {
        until: now + lists.window,
        after: history.navigations,
        connection: connections[identity]!,
      }
  }
  const unchanged =
    Object.keys(held).length === Object.keys(history.held).length &&
    Object.keys(held).every(identity => history.held[identity] === held[identity])
  return { connections, history: unchanged ? history : { ...history, held } }
}

/**
 * `ConnectionInvalidated`'s reduction. Asking again is also how a failed query
 * is retried, so the failure goes with the mark. A connection is often both: a
 * failed refresh stays due, and `Hydrated` restores one stale. Asking again
 * must still settle its failure, and its mark becomes a loading one, so a list
 * with no page to show reads `Loading` until its query answers.
 */
const invalidated = (model: RemoteModel, connection: string, because: string): RemoteModel => {
  const connections = setConnectionStale(model.connections, connection, true)
  const next = {
    ...model,
    connections,
    // Why it went stale, kept from the change that made it so; the reasons of
    // lists fresh again or gone are dropped as one is written.
    staleBecause:
      connections === model.connections
        ? model.staleBecause
        : {
            ...Object.fromEntries(
              Object.entries(model.staleBecause).filter(
                ([held]) => connections[held]?.stale === true,
              ),
            ),
            [connection]: because,
          },
    // Stale for a reason of its own: going back fetches it again.
    history: withoutHolds(model.history, [connection]),
    // Stale for a reason of its own now, not only for a placement's check.
    placed: withoutChecking(model.placed, connection),
    failures: withoutConnectionFailure(model.failures, connection),
    loading:
      connection in model.failures.connections
        ? new Set([...model.loading, connectionMark(connection)])
        : model.loading,
  }
  return sameFields(model, next) ? model : next
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
 * Every field a read's requests reach: their own, and through each relation
 * the store already holds, the fields they ask of its targets. A request with
 * a relation riding on it names no target id; the store does, and a failure
 * recorded on a target is reached only this way.
 */
const reachedMarks = (
  store: EntityStore,
  requests: ReadonlyArray<Requirement>,
): ReadonlyArray<string> => {
  const marks: string[] = []
  const walked = new Map<string, Set<RelationRequirement>>()
  const walk = (entity: string, id: string, requirement: RelationRequirement): void => {
    const key = entityKey(entity, id)
    const seen = walked.get(key) ?? new Set()
    if (seen.has(requirement)) return
    seen.add(requirement)
    walked.set(key, seen)
    for (const field of requirement.fields) {
      marks.push(fieldMark(entity, id, field))
      const nested = requirement.relations?.[field]
      if (nested === undefined) continue
      const value = readField(store, key, field)
      if (value._tag === 'None') continue
      for (const ref of targetsOf(value.value, nested)) walk(ref.entity, ref.id, nested)
    }
  }
  for (const request of requests) walk(request.entity, request.id, request)
  return marks
}

/** The entity key a field mark belongs to. */
const markEntity = (mark: string): string => mark.slice(0, mark.indexOf('\u0000'))

/**
 * The failures of what the roots still reach. A released connection's or
 * entity's failure goes with it, so asking for it again later asks the server
 * again rather than repeating an error that may no longer hold.
 *
 * Reached is retention's own walk, taken over the Model before collection. It
 * counts a relation's target and a list's row that the store does not hold,
 * which is exactly a value whose first read failed: it is still on screen,
 * behind the parent that refers to it.
 */
const prunedFailures = (
  failures: Failures,
  roots: RetentionRoots,
  reached: () => ReadonlySet<string>,
): Failures => {
  const named = new Set(roots.connections.map(root => root.identity))
  const connections = Object.entries(failures.connections).filter(([identity]) =>
    named.has(identity),
  )
  const fields =
    Object.keys(failures.fields).length === 0
      ? []
      : Object.entries(failures.fields).filter(([mark]) => reached().has(markEntity(mark)))
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
 * Whether a read is fetching any field `relation` reads of an entity, its own
 * or, through each relation the store holds, its targets'. A value whose owner
 * is being fetched is loading, not `Initial`: nothing is missing a fetch.
 */
export const isLoadingThrough = (
  model: RemoteModel,
  entity: string,
  id: string,
  relation: RelationRequirement,
): boolean => {
  if (model.loading.size === 0) return false
  const walked = new Map<string, Set<RelationRequirement>>()
  const walk = (target: string, targetId: string, requirement: RelationRequirement): boolean => {
    const key = entityKey(target, targetId)
    const seen = walked.get(key) ?? new Set()
    if (seen.has(requirement)) return false
    seen.add(requirement)
    walked.set(key, seen)
    for (const field of requirement.fields) {
      if (model.loading.has(fieldMark(target, targetId, field))) return true
      const nested = requirement.relations?.[field]
      if (nested === undefined) continue
      const value = readField(model.entities, key, field)
      if (value._tag === 'None') continue
      for (const ref of targetsOf(value.value, nested)) {
        if (walk(ref.entity, ref.id, nested)) return true
      }
    }
    return false
  }
  return walk(entity, id, relation)
}

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
  // Once per entity and requirement, as retention walks: two relations can
  // reach one entity for different fields, and skipping the second would hide
  // its failure. A requirement tree is finite, so cyclic data still ends.
  const walked = new Map<string, Set<RelationRequirement>>()
  const walk = (
    target: string,
    targetId: string,
    requirement: RelationRequirement,
  ): RemoteError | undefined => {
    const key = entityKey(target, targetId)
    const seen = walked.get(key) ?? new Set()
    if (seen.has(requirement)) return undefined
    seen.add(requirement)
    walked.set(key, seen)
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
 * A mutation answer's read without what a later request settled (#288): a
 * field it wrote, a row it deleted, and the absence of a row it wrote, which
 * the read would otherwise tombstone.
 */
const unsettledRead = (
  read: Schema.Schema.Type<typeof AnswerRead>,
  { newer, rewritten }: ReturnType<typeof settledLater>,
): Schema.Schema.Type<typeof AnswerRead> => {
  const entities = read.result.entities.flatMap(entity => {
    if (newer(entityKey(entity.entity, entity.id))) return []
    const values = Object.fromEntries(
      Object.entries(entity.values).filter(
        ([field]) => !newer(fieldMark(entity.entity, entity.id, field)),
      ),
    )
    return Object.keys(values).length === 0 ? [] : [{ ...entity, values }]
  })
  const settled = read.result.settled.flatMap(entry => {
    if (newer(entityKey(entry.entity, entry.id))) return []
    const fields = entry.fields.filter(field => !newer(fieldMark(entry.entity, entry.id, field)))
    return fields.length === 0 ? [] : [{ ...entry, fields }]
  })
  const answered = new Set(
    [...entities, ...settled].map(entry => entityKey(entry.entity, entry.id)),
  )
  // A request is kept for its windows, or to tombstone a row no later request wrote.
  const requests = read.requests.filter(request => {
    const key = entityKey(request.entity, request.id)
    return answered.has(key) || !rewritten(key)
  })
  return { requests, result: { entities, settled } }
}

const noRows: ReadonlySet<EntityKey> = new Set()

const rowsOf = (
  refs: ReadonlyArray<{ readonly entity: string; readonly id: string }> | undefined,
): ReadonlySet<EntityKey> =>
  refs === undefined || refs.length === 0
    ? noRows
    : new Set(refs.map(ref => entityKey(ref.entity, ref.id)))

/**
 * What an answer to a read may say of the rows held to a read-after token
 * (`EntityEntry.floor`). A row the read carried its token for and the server
 * read at it (not named in `behind`) is `confirmed`: the answer writes it and
 * its floor ends. Every other floored row the answer names is `held`: it was
 * asked without the token, at another one, or the server's read model is
 * behind it, so the answer may be older than the write, and writes nothing.
 * A row named in `behind` is held whether it has a floor or not.
 */
const readAfter = (
  store: EntityStore,
  requests: ReadonlyArray<Requirement>,
  result: Schema.Schema.Type<typeof ReadBatchResult>,
  sent: ReadonlyArray<Schema.Schema.Type<typeof RowToken>> | undefined,
): { readonly held: ReadonlySet<EntityKey>; readonly confirmed: ReadonlySet<EntityKey> } => {
  const tokens = new Map((sent ?? []).map(row => [entityKey(row.entity, row.id), row.token]))
  const behind = rowsOf(result.behind)
  // A row the server could not read at its token is no evidence it is gone, floored or not.
  const held = new Set<EntityKey>(behind)
  const confirmed = new Set<EntityKey>()
  for (const ref of [...requests, ...result.entities, ...result.settled]) {
    const key = entityKey(ref.entity, ref.id)
    const floor = store[key]?.floor
    if (floor === undefined) continue
    if (tokens.get(key) === floor && !behind.has(key)) confirmed.add(key)
    else held.add(key)
  }
  return { held: held.size === 0 ? noRows : held, confirmed }
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
  /** Rows the answer may not speak for (`readAfter`'s `held`): it writes, tombstones and settles none of them. */
  held: ReadonlySet<EntityKey> = noRows,
): EntityStore => {
  if (held.size > 0) {
    const free = (ref: { readonly entity: string; readonly id: string }) =>
      !held.has(entityKey(ref.entity, ref.id))
    requests = requests.filter(free)
    result = {
      ...result,
      entities: result.entities.filter(free),
      settled: result.settled.filter(free),
    }
  }
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
      put(entry.windows, field, windowKey(window))
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
    writes.push({
      key,
      values,
      windows: entry?.windows,
      ...(entity.revision === undefined ? {} : { revision: entity.revision }),
    })
  }
  // The server was asked for these ids by name and answered without them, and
  // without settling any of their fields: whether the entity never existed or
  // is gone, the client knows the same thing: it is not there. Without this the
  // read would stay `Loading` for good. A forced plan (`refresh`) asks again,
  // and any later write clears the tombstone.
  //
  // An id the server settled fields of is not absent: it was asked about and
  // the answer was "not this", which is about the fields, not the entity. What
  // the store already holds of it stays, and a tombstone asked about again is
  // forgotten, so the settled fields can be recorded.
  //
  // Only ids asked for directly: the target of a returned ref is left alone. A
  // server need not expand a relation that rides on a request; the planner
  // follows a relation the store holds and asks for its targets by id next, and
  // a tombstone here would stop it.
  const settled = new Set(result.settled.map(entry => entityKey(entry.entity, entry.id)))
  let answered = store
  for (const request of requests) {
    const key = entityKey(request.entity, request.id)
    if (!returned.has(key) && !settled.has(key)) answered = tombstone(answered, key)
    else if (settled.has(key) && isTombstone(answered, key)) answered = remove(answered, key)
  }
  // Settled after the values: a field the same result also answers is present,
  // and a present field is never marked.
  return setUnavailable(
    writeEntities(answered, writes, now),
    result.settled.map(entry => [entityKey(entry.entity, entry.id), entry.fields] as const),
    true,
  )
}
