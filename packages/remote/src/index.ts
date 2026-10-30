/**
 * `foldkit-remote` — normalized application-facing server state.
 *
 * The pure core (entities, selections, the store, the planner, connections,
 * live classification, optimistic layers) performs no I/O. The `Remote.*`
 * helpers that read or mutate go through the `RemoteClient` Effect service.
 */
import {
  Clock,
  Duration,
  Effect,
  Layer,
  Match,
  Option,
  Queue,
  Record,
  Result,
  Schema,
  Stream,
} from 'effect'
import { KeyValueStore } from 'effect/persistence'
import {
  Derivation,
  Entity as DomainEntity,
  Query as Relational,
  QueryEvaluateError,
  Operators,
  ReadFilter,
  SelectionTypeId,
  type ExprContext,
  type MemoryOperators,
} from 'foldkit-entity'
import type * as Domain from 'foldkit-entity'
import type { RpcClientError } from 'effect/rpc'
import { mapMessage, type Command } from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import * as Subscription from 'foldkit/subscription'
import type { EntryWithoutKeepAlive } from 'foldkit/subscription'
import {
  type ActiveSurface,
  type Contract,
  type Invalid,
  ModelRef,
  type Focus,
  type Projection,
  type Surface,
  type SurfaceSource,
  type Wiring,
} from 'foldkit-surface'
import {
  RemoteClient,
  liveEventOf,
  mintOperation,
  mutateRemote,
  remoteError,
  type RemoteRpcClient,
} from './client.js'
import {
  emptyConnection,
  hasNext,
  hasPrevious,
  isGapped,
  items,
  type Connection,
  type Edge,
} from './connection.js'
import {
  Entity,
  type EntityDescriptor,
  type EntityPatch,
  type EntityRef,
  type FieldsFrom,
  type PatchValues,
} from './entity.js'
import { wireValues } from './patchValues.js'
import { EntityChange, Impact, changesOf, impactOn, type HeldConnection } from './impact.js'
import { belongsEncoded, matching, type Judged, type Matched } from './matching.js'
import { readWhy, regressed, Why, type ReadStep, type ReadWhy } from './why.js'
import { failedReasons, reasonsOf, type WhyReader } from './whyReasons.js'

/** A body's dependencies as an explanation carries them: without the owner identity, which holds a symbol. */
const explainedDependencies = (dependencies: Domain.Dependencies): ExplainedDependencies => ({
  fields: dependencies.fields.map(({ entity, key }) => ({ entity, key })),
  inputs: dependencies.inputs,
  operations: dependencies.operations,
  operators: dependencies.operators.map(({ id, version }) => ({ id, version })),
})
import {
  inspectEntity,
  inspectRemote,
  type ExplainedDependencies,
  type QueryExplanation,
  type RemoteInspection,
} from './inspect.js'
import type { LiveCursor, LiveEvent } from './live.js'
import {
  failureOf,
  initialRemoteModel,
  overlaysOf,
  isFieldFailed,
  isLoadingThrough,
  onlyOverlaid,
  windowGrowthKey,
  isQueryLoading,
  isRemoteMessage,
  dismissQueued,
  forgetRemote,
  refreshIsInFlight,
  refreshedAt,
  remoteMessageCases,
  remoteMessageSchema,
  remoteModelSchema,
  retentionRootsSchema,
  invalidateConnections,
  readsStale,
  updateRemote,
  withRefreshRequested,
  writeRead,
  type RemoteMessage,
  type RemoteMessageInput,
  type RemoteMessageTag,
  type RemoteModel,
} from './model.js'
import {
  forgetFailure,
  mutationStatus,
  predictionOfWrite,
  foreseenOfWrite,
  brokenByWrite,
  forbiddenByWrite,
  DerivedBy,
  type MutationDescriptor,
  type MutationStatus,
  type NormalizedPatch,
  type PendingDelete,
} from './mutation.js'
import {
  connectionIdentity,
  emptyOptimistic,
  goneIn,
  heldOnlyByRequests,
  plannedStore,
  resolvedPatches,
  visibleItems,
  visibleStore,
  type ConnectionIdentity,
  type ConnectionOverlay,
  type EntityLayer,
  type OptimisticState,
  type OptimisticOperation,
} from './optimistic.js'
import { RowPlace, placeIn, withEdge } from './placement.js'
import { deadlineOf, plan, type Deadline, type PlanOptions } from './plan.js'
import { RemotePolicy } from './policy.js'
import { IDENTITY_SEPARATOR, stableStringify } from './query.js'
import type { ConnectionSpec, LivePolicy, QueryDescriptor, QueryRef, QueryWindow } from './query.js'
import { remoteDataSchema, type RemoteData, type RemoteError } from './remoteData.js'
import type { ConnectionRoot, RetentionRoots } from './retain.js'
import {
  Selection,
  assemble,
  pageSchema,
  relationOf,
  unavailableOf,
  type Page,
} from './selection.js'
import { sameData } from './data.js'
import {
  emptyStore,
  entityKey,
  isTombstone,
  missingFields,
  readField,
  type EntityStore,
} from './store.js'
import { RemotePersistence, type Snapshot } from './persistence.js'
import {
  backoff,
  channelFor,
  headOf,
  mergeStored,
  onlineAgain,
  operationOf,
  outboxStatus,
  readEntries,
  othersWaiting,
  readStored,
  sendLock,
  storedFromText,
  storedOf,
  storedText,
  storeLock,
  StoredWrite,
  settledIn,
  withLock,
  type OutboxStatus,
  type RetryOptions,
  type StoredOutbox,
} from './outbox.js'
import { targetsOf } from './relation.js'
import {
  QueryRequest,
  QueryResult,
  ReadRequest,
  RelationRequest,
  REMOTE_PROTOCOL_VERSION,
  WindowSchema,
  RemoteLiveError,
  RemoteForbidden,
  RemoteLiveRefused,
  RemoteMutationError,
  RemoteProtocolError,
  RemoteQueryError,
  RemoteReadError,
  RemoteRpc,
  RemoteUnauthenticated,
  RemoteUnreachable,
} from './wire.js'
import { coalescedLayer, type ClientOptions } from './coalesce.js'
import { withCallTimeout } from './deadline.js'
import {
  Requirement,
  RemoteConnections,
  RemoteRequirements,
  connectionsOf,
  requirementsOf,
  type ConnectionRequirement,
  type RelationRequirement,
} from './requirement.js'
import { markAll, resumePart } from './resume.js'
import { answerGaps } from './answerGaps.js'
import {
  PredictionPart,
  predictionMismatch,
  verification,
  withDiagnostics,
  type PredictionMismatch,
  type VerifyPredictions,
} from './diagnostics.js'
import { reduceReporting } from './reporting.js'
import { patchedFields, shownOf } from './shown.js'

import { http as httpClient, json as jsonClient } from './json.js'
import { httpWithLive as httpWithLiveClient } from './sse.js'
import { rpcFailure, rpcProtocolHttp } from './rpc.js'
export * from './client.js'
export type { RemoteResumePart } from './resume.js'
export {
  PredictionPart,
  type ExpectedDisagreements,
  type LiveRefused,
  type OutboxUnreadable,
  type OutboxUnsaved,
  type PredictionMismatch,
  type RemoteDiagnostic,
  type VerifyPredictions,
  type WriteUnheard,
} from './diagnostics.js'
// The channel Remote reports into, for a server or a test that uses Remote alone.
export { Diagnostics, type Diagnostic, type ReportDiagnostic } from 'foldkit-surface'
export * from './coalesce.js'
export { RemoteJsonAnswer, RemoteJsonRequest, type RemoteJsonSend } from './json.js'
export { httpWithLive, liveFetch, type LiveFetchOptions } from './sse.js'
export * from './connection.js'
export * from './entity.js'
export * from './inspect.js'
export * from './live.js'
export * from './matching.js'
export { placeIn, RowPlace } from './placement.js'
export { ReadWhy, ShownBy, Why, WhyTerm, type ReadStep } from './why.js'
export * from './model.js'
export * from './mutation.js'
export * from './optimistic.js'
export * from './persistence.js'
export { OutboxItemState, type OutboxItem, type OutboxStatus, type RetryOptions } from './outbox.js'
export * from './plan.js'
export * from './policy.js'
export * from './query.js'
export * from './relation.js'
export * from './remoteData.js'
export * from './requirement.js'
export * from './retain.js'
export * from './selection.js'
export * from './store.js'
export * from './wire.js'

/** What a domain registers: a Remote descriptor, or a `foldkit-entity` Entity (read through `Entity.from`). */
export type EntityLike = EntityDescriptor<any, any> | Domain.AnyEntity

/**
 * What a read selects: a Remote Selection, or a `foldkit-entity` Selection
 * (read through `Selection.from`).
 */
export type EntitySelection<Value, Name extends string, Id extends string = string> =
  | Selection<Value, Name, 'entity'>
  | Domain.Selection<Name, unknown, Schema.Constraint & { readonly Type: Value }, Id>

const descriptorOf = (entity: EntityLike): EntityDescriptor<any, any> =>
  DomainEntity.is(entity) ? Entity.from(entity as never) : entity

/** The Remote descriptor either kind of entity reads as, at the type level. */
type DescriptorOf<E extends EntityLike> =
  E extends EntityDescriptor<any, any>
    ? E
    : E extends Domain.AnyEntity
      ? EntityDescriptor<E['name'], FieldsFrom<E>>
      : never

type NameOf<E extends EntityLike> =
  DescriptorOf<E> extends EntityDescriptor<infer N, any> ? N : never
type FieldsOf<E extends EntityLike> =
  DescriptorOf<E> extends EntityDescriptor<any, infer F> ? F : never

const selectionOf = <Value, Name extends string>(
  selection: EntitySelection<Value, Name>,
): Selection<Value, Name, 'entity'> =>
  SelectionTypeId in selection ? (Selection.from(selection) as never) : selection

type EntityName<D> = D extends { readonly name: infer Name extends string } ? Name : never
type QueryName<D> = D extends QueryDescriptor<infer Name, any, any> ? Name : never
type MutationName<D> = D extends MutationDescriptor<infer Name, any, any> ? Name : never

/**
 * Nothing when `Name` is one of the domain's registered `Names`; otherwise a
 * branded failure naming the descriptor, so `Data.get(Team.select(…))` for an
 * unregistered `Team` errors at the selection in one line.
 */
export type Registered<Name extends string, Names extends string, Kind extends string> = [
  Name,
] extends [Names]
  ? unknown
  : Invalid<`${Kind} "${Name}" is not registered with this Remote domain`>

/** Nothing when a selection is of the query's entity; otherwise a branded failure naming both. */
export type SelectsEntity<Entity extends string, Of extends string> = [Entity] extends [Of]
  ? unknown
  : Invalid<`the selection is of "${Entity}", but the query lists "${Of}"`>

export interface RemoteDescriptor<
  Entities extends readonly EntityLike[] = readonly EntityLike[],
  Queries extends readonly QueryDescriptor<any, any, any>[] = readonly QueryDescriptor<
    any,
    any,
    any
  >[],
  Mutations extends readonly MutationDescriptor<any, any, any>[] = readonly MutationDescriptor<
    any,
    any,
    any
  >[],
> {
  readonly entities: Entities
  readonly queries: Queries
  readonly mutations: Mutations
  readonly Model: Schema.Codec<RemoteModel, unknown>
  readonly initial: RemoteModel
  readonly Message: Schema.Schema<RemoteMessage>
  readonly update: (model: RemoteModel, message: RemoteMessage) => RemoteModel
  readonly rpc: typeof RemoteRpc
  /** Name-keyed lookups built from the declared entities, queries, and mutations. */
  readonly registry: {
    readonly entities: ReadonlyMap<string, EntityDescriptor<any, any>>
    readonly queries: ReadonlyMap<string, QueryDescriptor<any, any, any>>
    readonly mutations: ReadonlyMap<string, MutationDescriptor<any, any, any>>
    /**
     * Per entity name, the members its server filters rows by under a rule
     * the client does not run (`ReadFilter`), so a change to one is fetched,
     * not placed.
     */
    readonly filtered: ReadonlyMap<string, ReadonlyArray<string>>
    /**
     * Per entity name, the members other registered Entities derive over its
     * relations (`Derived.count`, `Derived.exists`), which a write of it
     * moves: what a declared write predicts.
     */
    readonly derived: ReadonlyMap<string, ReadonlyArray<DerivedBy>>
  }
}

declare const boundRemoteNames: unique symbol

export interface BoundRemote<AppModel, Store extends RemoteModel, Names extends string = string> {
  readonly definition: RemoteDescriptor
  /** The focus of the store's place in the application Model. */
  readonly store: Focus<AppModel, Store>
  /** For `Module`: owns the store's Model path. */
  readonly contract: Contract
  /**
   * How the client runs primitive operators: `Remote.make`'s table, which a
   * pending computed assignment is predicted by wherever the store is read.
   */
  readonly operators: MemoryOperators
  /** Phantom: the entity names this Remote definition registers. */
  readonly [boundRemoteNames]?: Names
}

type MutationInput<M> = M extends MutationDescriptor<any, infer Input, any> ? Input : never
type MutationRefusal<M> =
  M extends MutationDescriptor<any, any, any, infer Refused> ? Refused : never

/** How `Data.persistence` keeps the cache across a reload. */
export interface PersistenceOptions<AppModel> {
  /**
   * Where the snapshot is stored, from the Model: one key per principal, so a
   * change of principal reads and writes another snapshot.
   */
  readonly key: (model: AppModel) => string
  /** Who the snapshot is for; one taken under another scope is discarded. */
  readonly scope: (model: AppModel) => string
  /** The query connections whose rows survive a reload; none by default. */
  readonly connections?: ReadonlyArray<ConnectionIdentity> | undefined
  /** What to keep, when it is not `snapshotOf` the `connections`. */
  readonly snapshot?: ((remote: RemoteModel) => Snapshot) | undefined
  /** A snapshot larger than this is neither written nor read. */
  readonly maxBytes?: number | undefined
  /** How long the cache must be unchanged before it is written; default 250 milliseconds. */
  readonly debounce?: Duration.Input | undefined
}

/** `Data.persistence`'s wiring, and the restore its runtime's `init` starts from. */
export interface PersistenceWiring<AppModel> extends Wiring<
  AppModel,
  RemoteMessage,
  KeyValueStore.KeyValueStore
> {
  /**
   * The Model with the snapshot stored under its `key` restored, as the wiring
   * would restore it. Resolve it as the runtime's `flags` and start `init`
   * from it, so the first frame draws the stored rows; the wiring then
   * restores only when `key` changes. A store it cannot read leaves the Model
   * as it is, and the wiring tries again.
   */
  readonly restore: (model: AppModel) => Effect.Effect<AppModel, never, KeyValueStore.KeyValueStore>
}

/** How `Data.outbox` keeps durable writes across a reload. */
export interface OutboxOptions<AppModel> {
  /**
   * Where the queue is stored, from the Model: one key per principal, so one
   * person's waiting writes are never sent as another's.
   */
  readonly key: (model: AppModel) => string
  /**
   * Who the queue is for, the principal. One stored under another scope reads
   * as empty and is never written over; a page whose scope changes sends
   * nothing it read for the old one, and reads the new one's.
   */
  readonly scope: (model: AppModel) => string
  /** The wait between sends nothing answered: 1 second doubling to 30, unless given. */
  readonly retry?: RetryOptions | undefined
}

/** `Data.outbox`'s wiring, and the restore its runtime's `init` starts from. */
export interface OutboxWiring<AppModel> extends Wiring<
  AppModel,
  RemoteMessage,
  KeyValueStore.KeyValueStore | RemoteClient
> {
  /**
   * The Model with the stored queue under its `key` read back, as the wiring
   * would read it, and this page's session minted. Resolve it as the runtime's
   * `flags` and start `init` from it: a durable write needs the session, and
   * the first frame then shows the waiting writes.
   */
  readonly restore: (model: AppModel) => Effect.Effect<AppModel, never, KeyValueStore.KeyValueStore>
}

export interface DomainMutateOptions {
  /** Overrides the generated id, for a retry, a durable bridge, or a test. Not with `durable`. */
  readonly requestId?: string | undefined
  /**
   * Queues the write in `Data.outbox` rather than sending it: stored first,
   * sent in order by one tab, sent again after a reload with the same
   * operation id and `now`, and after a failure that nothing answered. Its
   * Command answers `MutationQueued`; the outbox's Subscriptions send it. Needs
   * the outbox's `restore` to have run, and an input its Mutation encodes.
   */
  readonly durable?: boolean | undefined
  /**
   * What the request changes before the server answers, released when it
   * settles. A function receives the generated ids, so a created entity can
   * carry `tempId` until the result names the real one.
   */
  readonly optimistic?:
    | ReadonlyArray<OptimisticOperation>
    | ((ids: {
        readonly requestId: string
        readonly tempId: string
      }) => ReadonlyArray<OptimisticOperation>)
    | undefined
  /**
   * When the reader acted, in milliseconds since the epoch: what a time the
   * write sets (`Expr.now` in `Entity.sets`) is predicted as, and the same
   * number the request sends, which the server takes within its `clockSkew`.
   * Read it where the action is, with `Remote.now`, since `update` reads no
   * clock. Without it the time is not predicted, and the server's clock decides.
   */
  readonly now?: number | undefined
  /**
   * For a mutation that is a `Write`: the input keys to write, when only some
   * changed (what an author edited). The rest of the input is still sent, whole.
   */
  readonly keys?: ReadonlyArray<string> | undefined
  /**
   * How long this send waits for its answer, over the client's `timeout`;
   * one that runs out fails `RemoteUnreachable`. Not with `durable`: the
   * outbox sends a durable write under the client's `timeout`.
   */
  readonly timeout?: Duration.Input | undefined
}

/**
 * One entry of the active record `subscriptions`, `wiring` and `satisfy`
 * take: a Surface as the Model activates it (`Surface.at`/`Surface.when`),
 * a source of keyed instances (`Surface.each`, or any `SurfaceSource`), or a
 * Surface without params read whole. A family joins its parent's
 * requirements with its instances', so passing the family alone fetches both
 * the page and what the page reveals.
 */
export type ActiveEntry<AppModel> =
  | ActiveSurface<AppModel>
  | Surface<AppModel, any, any, void>
  | SurfaceSource<AppModel>

/** A Foldkit Subscription entry of the Remote domain, emitting its Messages through `RemoteClient`. */
export type RemoteEntry<AppModel, Dependencies> = EntryWithoutKeepAlive<
  AppModel,
  RemoteMessage,
  Dependencies,
  RemoteClient
>

/**
 * The entries `RemoteDomain.subscriptions` returns for an active record: a read
 * and a live entry per key (the live one idles when nothing is read live), and
 * `retain`.
 */
export type SubscriptionEntries<AppModel, Active, Message = RemoteMessage> = {
  // `Object.entries` turns a numeric key into a string, so numeric keys have entries too.
  readonly [K in keyof Active & (string | number) as `${K}.read`]: EntryWithoutKeepAlive<
    AppModel,
    Message,
    ReadDependencies,
    RemoteClient
  >
} & {
  readonly [K in keyof Active & (string | number) as `${K}.live`]: EntryWithoutKeepAlive<
    AppModel,
    Message,
    LiveDependencies,
    RemoteClient
  >
} & {
  readonly retain: EntryWithoutKeepAlive<AppModel, Message, RetentionRoots, never>
}

/** The dependencies of a live entry: what it subscribes to, and where a restart resumes. */
export interface LiveDependencies {
  readonly requirements: ReadonlyArray<Requirement>
  /** The lists read live, each as its read sends it. */
  readonly queries: ReadonlyArray<Schema.Schema.Type<typeof QueryRequest>>
  readonly cursor: LiveCursor
  readonly floor: number
  /** How many times the stream broke; each break restarts it. */
  readonly restarts: number
  /** Breaks since its last applied event, which the restart's backoff grows with. */
  readonly failures: number
}

/**
 * Whether what an active entry reads live is arriving. `Reconnecting` is a
 * stream that broke and waits to resubscribe; until it has, changes are
 * missed, and its rows may be out of date. `Refused` is a stream the server
 * would not open for what it asks: it is not retried until that changes.
 */
export type LiveStatus =
  /** It reads nothing live. */
  | { readonly _tag: 'Idle' }
  /** Subscribed, and not broken since. */
  | { readonly _tag: 'Live' }
  | {
      readonly _tag: 'Reconnecting'
      /** Breaks in a row, the first being 1. */
      readonly attempt: number
      /** Why it broke; none for a gap in its events. */
      readonly error: Option.Option<RemoteError>
    }
  /** The server refused it (`RemoteLiveRefused`); it waits for what it asks to change. */
  | { readonly _tag: 'Refused'; readonly error: RemoteError }

export interface SubscriptionsOptions extends ObserveOptions, LiveOptions, RetainOptions {}

/**
 * A Remote domain's wiring for an assembly: it routes Remote's Messages into
 * `reduce`, brings its Subscriptions and contract, and requires `RemoteClient`
 * from the runtime's resources Layer. The `Shared` tags reach the
 * application's own update too, after Remote has reduced them.
 */
export type RemoteWiring<AppModel, Shared extends RemoteMessageTag = never> = Wiring<
  AppModel,
  RemoteMessage | RemoteMessageInput,
  RemoteClient,
  RemoteMessageTag
> & { readonly shared: ReadonlyArray<Shared> }

/** How `Data.wiring` joins an assembly: its Subscriptions' options, and what the application hears. */
export interface WiringOptions<
  Shared extends RemoteMessageTag = never,
> extends SubscriptionsOptions {
  /**
   * Remote's Messages the application's own `update` receives as well, after
   * Remote has reduced them, so the Model it gets already holds what they say:
   * `['MutationFailed']` to react to a write that failed.
   */
  readonly shared?: ReadonlyArray<Shared> | undefined
}

/**
 * A write that failed and is neither retried nor dismissed, typed by its
 * mutation: what `Data.failedWrites` lists.
 */
export interface FailedWrite<M extends MutationDescriptor<any, any, any, any>> {
  readonly requestId: string
  readonly mutation: M
  /** The input it was started with, to show or give back. */
  readonly input: MutationInput<M>
  readonly error: RemoteError
  /** Why the server refused it, as `mutation` declares; none for any other failure. */
  readonly refusal: Option.Option<MutationRefusal<M>>
}

/** `FailedWrite` of each of a union of mutations. */
export type FailedWriteOf<M> =
  M extends MutationDescriptor<any, any, any, any> ? FailedWrite<M> : never

/** What `RemoteDomain.mutate` hands `update`: the Model with the request started, and the Command that settles it. */
export interface MutationStarted<AppModel> {
  readonly model: AppModel
  readonly requestId: string
  readonly tempId: string
  /** Yields `MutationSucceeded` or `MutationFailed`; never fails. */
  readonly command: Command<RemoteMessage, never, RemoteClient>
}

/**
 * A Remote domain bound to its place in the application Model: the descriptor
 * (`Remote.define`), the binding (`Remote.at`), and the application-facing
 * operations over them. Every method compiles to the `Remote.*` function of the
 * same name, which stays exported for tooling, SSR, and tests.
 */
export interface RemoteDomain<
  AppModel,
  Store extends RemoteModel,
  Entities extends readonly EntityLike[],
  Queries extends readonly QueryDescriptor<any, any, any>[],
  Mutations extends readonly MutationDescriptor<any, any, any>[],
>
  extends
    BoundRemote<AppModel, Store, EntityName<Entities[number]>>,
    RemoteDescriptor<Entities, Queries, Mutations> {
  /** `Remote.select`: a Projection reading one entity through a selection of a registered entity. */
  get<Value, Name extends string, Id extends string = string>(
    selection: EntitySelection<Value, Name, Id> &
      Registered<Name, EntityName<Entities[number]>, 'Entity'>,
    // The id type of the Entity selected: another Entity's branded id does not fit.
    id: NoInfer<Id>,
  ): Projection<AppModel, RemoteData<Value>>
  /**
   * `get`, and the projection also subscribes to the entity's changes: its
   * requirements are marked `live`, so `subscriptions` derives a live entry for
   * the Surfaces that read it.
   */
  live<Value, Name extends string, Id extends string = string>(
    selection: EntitySelection<Value, Name, Id> &
      Registered<Name, EntityName<Entities[number]>, 'Entity'>,
    // The id type of the Entity selected: another Entity's branded id does not fit.
    id: NoInfer<Id>,
  ): Projection<AppModel, RemoteData<Value>>
  /**
   * A query connection read as a `Page` of items selected of the query's
   * entity: `Initial` until the page and every item's selected fields are
   * present, `Refreshing` while any of them is being refetched. The window is
   * the page first asked for; the pages `next`, `previous` and `fetch` merge
   * onto the connection read through the same projection.
   */
  query<Q extends QueryDescriptor<any, any, any>, Value, Entity extends string>(
    query: Q & Registered<Q['name'], QueryName<Queries[number]>, 'Query'>,
    input: QueryInput<Q>,
    options: QueryOptions<Value, Entity, QueryEntity<Q>>,
  ): QueryProjection<AppModel, Value, Q['name'], QueryInput<Q>>
  /**
   * "Load more": the Model with the read's window grown by one page, so it
   * shows that many more rows; the read entry fetches what the connection
   * lacks. None when the read shows everything there is (or is not a sized
   * window). Called from `update`.
   */
  more<Name extends string, Input>(
    model: AppModel,
    projection: QueryProjection<AppModel, any, Name, Input>,
  ): Option.Option<AppModel>
  /**
   * What a query read is and what it currently is, as one serializable value —
   * data-query-DESIGN §29.1: the domain, the definition and its input, the
   * connection identity, the window, the Selection, the body as readable text
   * with what it depends on, and what the read answers from this Model.
   *
   * Pure, so a DevTools panel showing it shows something the Model can be
   * replayed to.
   *
   * Given `surfaces` — the same active record `subscriptions` takes — it also
   * reports which of them read this connection, and why each is active where
   * that is a readable fact (`Surface.when`) rather than a callback
   * (`Surface.at`). A Projection cannot carry this itself: several Surfaces may
   * read one connection, so it is not a property of the read.
   */
  explain<Name extends string, Input>(
    model: AppModel,
    projection: QueryProjection<AppModel, any, Name, Input>,
    options?: {
      readonly surfaces?:
        | Readonly<Record<string, ActiveSurface<AppModel> | SurfaceSource<AppModel>>>
        | undefined
    },
  ): QueryExplanation
  /**
   * Why a read shows what it shows. Any Remote read: `Data.get`, `Data.live`
   * or `Data.query`, or a projection made of them.
   *
   * `because` is every fact the Model holds about what it reads, as typed
   * references: a list or a row's fields missing, stale, in flight or
   * failed; a pending write showing a value, and which `where` term put a row
   * in a list or took it out. The reason that decides the state comes first,
   * and `message` says it, with what restarts it. For `Initial`, given
   * `surfaces` (the record `subscriptions` takes), it tells the two wiring
   * mistakes apart: no active Surface reads it, or one does and Remote's
   * Subscriptions are not running. Pure: it reads the Model and plans nothing.
   */
  why(
    model: AppModel,
    projection: Projection<AppModel, RemoteData<unknown>>,
    options?: {
      readonly surfaces?:
        | Readonly<Record<string, ActiveSurface<AppModel> | SurfaceSource<AppModel>>>
        | undefined
    },
  ): ReadWhy
  /**
   * Each change of each read's tag across a recorded history (the Messages
   * `update` handled, each with the Model it left, as Foldkit's devtools
   * records them), with the Message that made it and `why` at the Model it
   * changed to. `regression` marks a read that showed a value and stopped
   * with no reason a reader can see (#234).
   */
  timeline<Message>(
    start: AppModel,
    history: ReadonlyArray<{ readonly message: Message; readonly model: AppModel }>,
    reads: Readonly<Record<string, Projection<AppModel, RemoteData<unknown>>>>,
    options?: {
      readonly surfaces?:
        | Readonly<Record<string, ActiveSurface<AppModel> | SurfaceSource<AppModel>>>
        | undefined
    },
  ): ReadonlyArray<ReadStep<Message>>
  /**
   * The rows of a loaded list that a body matches, decoded as the list decodes
   * them — a filter that asks the server nothing.
   *
   * **It filters a list; it does not run a query.** That distinction is what
   * keeps it honest. "Which rows match" would need to know that the list holds
   * every row the body could match, which is predicate containment and is
   * deliberately not built. "Which rows *of this list* match" is decidable from
   * what is already here, and is what a search box over a loaded page actually
   * wants.
   *
   * `complete` says whether the answer is about the whole list: every edge
   * judged, and the connection terminal at both ends. An incomplete answer is
   * not wrong — it is about less than the caller may have meant, which is why
   * it is said rather than left for a view to assume.
   *
   * Creates no connection, so there is nothing new to retain and nothing new to
   * fetch. The server stays authoritative for which rows exist.
   */
  filtered<Value, Name extends string, Input, Q extends QueryDescriptor<any, any, any>>(
    model: AppModel,
    over: QueryProjection<AppModel, Value, Name, Input>,
    by: Q & Registered<Q['name'], QueryName<Queries[number]>, 'Query'>,
    input: QueryInput<Q>,
  ): Matched<Value>
  /**
   * Shows operations over the store with no request behind them, as a mutation's
   * `optimistic` ones show while it is in flight: every Selection and view draws
   * them. For a preview of a change nobody has made. They stay until `lift`;
   * showing an id again replaces what it showed. Called from `update`. A read
   * of an entity only overlays show, lacking a field it selects, is `Failed`
   * (`Overlaid`): nothing will fetch that field.
   */
  overlay(model: AppModel, id: string, optimistic: ReadonlyArray<OptimisticOperation>): AppModel
  /** Lifts what `overlay` showed under this id. Lifting nothing returns the same Model. */
  lift(model: AppModel, id: string): AppModel
  /**
   * The ids `overlay` shows now, in the order they are drawn, a later one over
   * an earlier: what a caller that overlays from its own state reconciles
   * against.
   */
  overlays(model: AppModel): ReadonlyArray<string>
  /**
   * The edges a connection shows, as its reads draw them: the server's pages
   * with pending edits placed, each inserted row where the body's order puts
   * it (or at the end its overlay names, when it cannot be placed), minus
   * removed edges and tombstones. Takes the `RemoteModel`, so a persistence
   * `snapshot` can store a list as it is shown.
   */
  visibleItems(remote: RemoteModel, connection: ConnectionIdentity): ReadonlyArray<Edge>
  /**
   * `Remote.refresh`: marks what `target` reads for this Model as due, for its
   * read entries to refetch. `target` is a projection, a Surface without
   * params, one entry of the active record, or the record itself, whose
   * params come from the Model as they do for `subscriptions`; or a
   * registered query's ref, which invalidates that list whatever its window. With
   * `{ failed: true }` only what failed is asked again: a "Try again".
   */
  refresh(
    model: AppModel,
    target: RefreshTarget<AppModel, QueryName<Queries[number]>>,
    options?: RefreshOptions,
  ): AppModel
  /** `Remote.forget`: the Model with every server-derived fact gone, for a change of principal. */
  forget(model: AppModel): AppModel
  /**
   * A read of this domain as an active Surface, for `subscriptions` and
   * `wiring`: `projectionOf` is what it reads for a Model, none while it
   * reads nothing. It belongs to the domain's application, and lists no
   * Messages: it is a requirement, not a sender. A domain made from a raw
   * optic names no application, so this throws for one.
   */
  active<Value>(
    name: string,
    projectionOf: (model: AppModel) => Option.Option<Projection<AppModel, Value>>,
  ): ActiveSurface<AppModel, Value>
  /**
   * The Foldkit Subscription entries for the active record, keyed for
   * `Subscription.make`: a read entry per record entry (`Remote.observe`), a
   * live entry per record entry that reads through `live` (`Remote.live`), and
   * one retain entry (`Remote.retain`). A `Surface.each` family is one record
   * entry whose read unions its parent's requirements with its instances'.
   * Retention is the domain's: the retain entry of every call roots the active
   * Surfaces of every call, so reads split over calls (one per policy) do not
   * collect each other's data. A Surface's params are a function of the Model
   * (`Surface.at`), so what is fetched, subscribed, and retained follows the
   * Model.
   */
  subscriptions<const Active extends Readonly<Record<string, ActiveEntry<AppModel>>>>(
    active: Active,
    options?: SubscriptionsOptions,
  ): SubscriptionEntries<AppModel, Active>
  /** `Remote.plan`: the requirements the store does not satisfy. */
  plan<Value>(
    model: AppModel,
    projection: Projection<AppModel, Value>,
    options?: PlanOptions,
  ): ReadonlyArray<Requirement>
  /** `Remote.meta`: when what a projection shows was last received, and whether it is stale or loading. */
  meta<Value>(model: AppModel, projection: Projection<AppModel, Value>): ReadMeta
  /** `Remote.storeOf`: the visible store, base under the pending optimistic layers. */
  storeOf(model: AppModel): EntityStore
  /**
   * `Remote.confirmed`: the same projection read against the server-derived
   * store alone, with every pending optimistic layer and connection overlay
   * left off. What it plans is unchanged — the requirements are the
   * projection's own — so observing it reads exactly what observing the
   * projection reads; only what it *shows* differs.
   *
   * A view usually wants the projection itself, which is the visible read:
   * the optimistic layers are there so a change shows before the server has
   * agreed to it. This is for the reader that must not believe a change until
   * the server has confirmed it, which in practice is an Agent capability
   * reporting that what it was asked to do is done:
   *
   * ```ts
   * Agent.when({
   *   projection: Data.confirmed(ProjectPage.model.project),
   *   predicate: (project, request) => project.name === request.name,
   * })
   * ```
   *
   * There is deliberately no `visible`: a projection is already the visible
   * read, and a wrapper that only forwards would be a second name for it.
   */
  confirmed<P extends Projection<AppModel, any>>(projection: P): P
  /**
   * The plan run through `RemoteClient` and reduced into the Model: the
   * projection's pending queries first, then the fields it lacks (the pages'
   * items included). For SSR, route or hover prefetch, and tests.
   */
  prefetch<Value>(
    model: AppModel,
    projection: Projection<AppModel, Value>,
    options?: ObserveOptions,
  ): Effect.Effect<
    AppModel,
    | RemoteReadError
    | RemoteProtocolError
    | RemoteQueryError
    | RemoteUnauthenticated
    | RemoteUnreachable,
    RemoteClient
  >
  /**
   * The Model with everything the active Surfaces read, for a render that
   * fetches nothing (SSR, a prerender). Each pass prefetches every Surface
   * that plans a read, over the Model the one before it left, so a Surface
   * active only once another's read has arrived is read in the next pass (or
   * the same one, when it comes later in `active`). It stops at the first
   * pass that plans nothing, and fails with `RemoteUnsatisfied` when
   * `options.passes` run out first. Reads are cache-first: a field already
   * held is not asked again. A server that could not tell who is asking
   * fails it with `RemoteUnauthenticated`, for the host to answer as it
   * answers a lost session.
   */
  satisfy(
    model: AppModel,
    active: Readonly<Record<string, ActiveEntry<AppModel>>>,
    options?: SatisfyOptions,
  ): Effect.Effect<
    AppModel,
    | RemoteReadError
    | RemoteProtocolError
    | RemoteQueryError
    | RemoteUnauthenticated
    | RemoteUnreachable
    | RemoteUnsatisfied,
    RemoteClient
  >
  /**
   * `satisfy` from `update`, for a destination the reader has not reached:
   * a hover over a link, or a navigation the app expects. `model` is the
   * Model as it would be there (the route set to the target's); the Command
   * reads what `active` would read in it and yields one `Preloaded`
   * carrying the Messages that wrote it, which reduce into the Model as it is
   * by then. It never fails: a read that fails is one the destination makes
   * again, and what was read before it still arrives.
   *
   * What it reads is kept like any other read until the next change of what
   * is retained, so preload close to the navigation it expects.
   */
  preload(
    model: AppModel,
    active: Readonly<Record<string, ActiveEntry<AppModel>>>,
    options?: SatisfyOptions,
  ): Command<RemoteMessage, never, RemoteClient>
  /**
   * Starts a registered mutation from `update`: applies `MutationStarted` (with
   * the optimistic operations) to the Model and returns the Command that runs
   * it and yields the settling Message. The request id comes from the model's
   * mutation sequence unless `options.requestId` is given.
   */
  mutate<M extends MutationDescriptor<any, any, any>>(
    model: AppModel,
    mutation: M & Registered<M['name'], MutationName<Mutations[number]>, 'Mutation'>,
    input: MutationInput<M>,
    options?: DomainMutateOptions,
  ): MutationStarted<AppModel>
  /**
   * What Remote knows of a mutation `mutate` started, by its request id:
   * pending, applied, or failed with the error the server or transport gave.
   */
  mutation(model: AppModel, requestId: string): MutationStatus
  /**
   * Why the server refused a mutation, as the value its `Refusal` declares:
   * none while it is pending or applied, when it failed for another reason,
   * or when the refusal does not decode as `mutation`'s.
   */
  refusal<Refused>(
    model: AppModel,
    requestId: string,
    mutation: MutationDescriptor<string, any, any, Refused>,
  ): Option.Option<Refused>
  /**
   * The writes that failed and are still owed an answer, oldest first, each
   * with its mutation, the input it was started with, and why it failed. Given
   * a mutation, only its writes, with its input type. A write is listed until
   * `retry` sends it again, `dismiss` forgets it, or `forget` changes the
   * principal; nothing drops one on a timer, since that would hide a failure
   * the reader has not seen.
   */
  failedWrites(model: AppModel): ReadonlyArray<FailedWriteOf<Mutations[number]>>
  failedWrites<M extends MutationDescriptor<any, any, any, any>>(
    model: AppModel,
    mutation: M & Registered<M['name'], MutationName<Mutations[number]>, 'Mutation'>,
  ): ReadonlyArray<FailedWrite<M>>
  /**
   * Sends a failed write again as itself: the same input, request id and
   * operation id (so a server that applied it answers from its record), with
   * its optimistic operations shown again. None unless `failedWrites` lists it.
   * A durable one is queued again, and the outbox sends it.
   */
  retry(model: AppModel, requestId: string): Option.Option<MutationStarted<AppModel>>
  /**
   * Forgets a failed write, so `failedWrites` no longer lists it; a durable one,
   * or one the outbox cannot read, goes from its store and every tab. Anything
   * else (a write still waiting, too) returns the same Model.
   */
  dismiss(model: AppModel, requestId: string): AppModel
  /**
   * The durable writes not yet settled, every tab's, in the order the outbox
   * sends them: how many wait, how many the server refused, and each one's
   * state, for a "3 changes waiting" line.
   */
  outboxStatus(model: AppModel): OutboxStatus
  /**
   * Whether what `active` reads live is arriving: `Reconnecting` from the
   * moment its stream breaks until it resubscribes, which its live entry does
   * on its own, with backoff.
   */
  liveStatus(model: AppModel, active: ActiveEntry<AppModel>): LiveStatus
  /** `updateRemote` on the bound slice: reduces one of Remote's Messages, as `RemoteMessage` or as the application's union constructs it. */
  reduce(model: AppModel, message: RemoteMessage | RemoteMessageInput): AppModel
  /**
   * How this domain joins an assembly: it routes Remote's Messages into
   * `reduce`, brings its Subscriptions and contract, and requires
   * `RemoteClient` from the runtime's resources Layer. One assembly holds at
   * most one Remote wiring: every domain claims the same tags, and routing
   * takes the first claimant. `shared` names the Messages the application's
   * own update hears too.
   */
  wiring: <
    const Active extends Readonly<Record<string, ActiveEntry<AppModel>>>,
    const Shared extends RemoteMessageTag = never,
  >(
    active: Active,
    options?: WiringOptions<Shared>,
  ) => RemoteWiring<AppModel, Shared>
  /**
   * Keeps the cache across a reload, as a wiring beside `wiring`: the stored
   * snapshot for `key` is restored (`Hydrated`, with what the store already
   * holds kept over it, so a page resumed from the server wins) whenever the
   * Model is not yet restored from `key`; and the cache is written back when it
   * changes, once its own snapshot is in. Start `init` from its `restore` so
   * the first frame already holds the snapshot. Overlays, optimistic layers,
   * the mutation ledger, live cursors and gaps are never stored. A change of
   * principal should `forget` in `update`, and name another `key`.
   */
  persistence(options: PersistenceOptions<AppModel>): PersistenceWiring<AppModel>
  /**
   * Keeps durable writes (`mutate`'s `durable`) across a reload and sends
   * them, as a wiring beside `wiring`: the queue is written to `key` before a
   * write is sent, sent oldest first by one tab (a Web Lock), sent again after
   * a failure that nothing answered with a backoff, and read back by every
   * tab. Start `init` from its `restore`. A change of principal should
   * `forget` in `update`, and name another `key`.
   */
  outbox(options: OutboxOptions<AppModel>): OutboxWiring<AppModel>
  /** `Remote.inspect` of the bound slice. */
  inspect(model: AppModel): RemoteInspection
  /** Whether the domain verifies its predictions (`verifyPredictions`), which a trace requires. */
  readonly verifiesPredictions: boolean
}

/** What `Remote.fold(Data, …).mutate` starts: `Data.mutate`'s result with its Command lifted. */
export type FoldedMutationStarted<AppModel, ParentMessage> = Omit<
  MutationStarted<AppModel>,
  'command'
> & {
  readonly command: Command<ParentMessage, never, RemoteClient>
}

/**
 * A bound domain folded under one of the application's own Message variants,
 * from `Remote.fold`. Calling it reduces a Remote Message into the Model; the
 * members that produce Messages, `fetch`, `mutate`, and `subscriptions`,
 * yield the wrapper Message instead of `RemoteMessage`, with the lift recorded
 * so Story and Scene can resolve a fetch or a mutation by Remote's own answer.
 * Members that only read or write the Model (`get`, `refresh`, `next`,
 * `overlay`, and the rest) stay on the domain itself.
 */
export interface RemoteFold<
  AppModel,
  ParentMessage,
  Domain extends RemoteDomain<AppModel, any, any, any, any>,
> {
  (
    model: AppModel,
    message: RemoteMessage | RemoteMessageInput,
  ): Update.Return<AppModel, ParentMessage>
  /** `Data.mutate`, its Command lifted. */
  readonly mutate: (
    ...args: Parameters<Domain['mutate']>
  ) => FoldedMutationStarted<AppModel, ParentMessage>
  /** `Data.retry`, its Command lifted. */
  readonly retry: (
    ...args: Parameters<Domain['retry']>
  ) => Option.Option<FoldedMutationStarted<AppModel, ParentMessage>>
  /** `Data.preload`, its Command lifted. */
  readonly preload: (
    ...args: Parameters<Domain['preload']>
  ) => Command<ParentMessage, never, RemoteClient>
  /** `Data.subscriptions`, every entry lifted to the wrapper Message. */
  readonly subscriptions: <const Active extends Readonly<Record<string, ActiveEntry<AppModel>>>>(
    active: Active,
    options?: SubscriptionsOptions,
  ) => SubscriptionEntries<AppModel, Active, ParentMessage>
}

/** The application Model a bound domain is over. */
export type ModelOfDomain<Domain> =
  Domain extends RemoteDomain<infer AppModel, any, any, any, any> ? AppModel : never

/** A projection's connection requirement with the `QueryRef` that runs it. */
export interface QueryRequirement extends ConnectionRequirement {
  readonly ref: QueryRef<string, unknown>
}

/** A page forward (`first`, `after`) or back (`last`, `before`); mixing the two is a type error. */
export type QueryWindowOptions =
  | {
      readonly first?: number | undefined
      readonly after?: string | undefined
      readonly last?: undefined
      readonly before?: undefined
    }
  | {
      readonly last: number
      readonly before?: string | undefined
      readonly first?: undefined
      readonly after?: undefined
    }

export type QueryOptions<Value, Entity extends string, Of extends string = Entity> = {
  /** What to read of each item: a selection of the query's entity (`Of`). */
  readonly select: EntitySelection<Value, Entity> & SelectsEntity<Entity, Of>
  /**
   * Watch the list live while a Surface reads it: rows that join, change or
   * leave it are streamed (by a live source that watches queries, such as
   * `foldkit-remote-drizzle`'s `pollLive`). Needs `first`.
   */
  readonly live?: boolean | undefined
} & QueryWindowOptions

/** A query connection read as a `Page` of selected items; `ref` is the connection with its first window. */
export interface QueryProjection<AppModel, Value, Name extends string, Input> extends Projection<
  AppModel,
  RemoteData<Page<Value>>
> {
  readonly ref: QueryRef<Name, Input>
  /** What it reads of each item, so a filter over the same list decodes identically. */
  readonly selection: Selection<Value, string>
}

/** The input of a query descriptor. */
export type QueryInput<Q> = Q extends QueryDescriptor<any, infer Input, any> ? Input : never
/** The entity a query's connection is over. */
export type QueryEntity<Q> =
  Q extends QueryDescriptor<any, any, ConnectionSpec<infer Entity>> ? Entity : string

/**
 * What one consumer asks of one connection, as the pieces it is actually made
 * of — data-query-DESIGN §11's read contract, with only the parts that exist
 * here:
 *
 * - **source** — the `QueryRef`: the query and its input, whose `identity`
 *   names the connection and deliberately excludes the window.
 * - **window** — how much of it this consumer wants.
 * - **shape** — the Selection, as the relation slice a read asks the server for.
 *
 * The design's other two are absent on purpose. *Expectation* (required versus
 * optional) has no consumer yet, so there is nothing to carry. *Observation* is
 * a policy of the subscription that runs the read, not of the read itself: one
 * policy covers every connection an active Surface asks for.
 *
 * This is a shaping step, not a public type. The design asked for the
 * separation, not for a new API to compose it with.
 *
 * Note what is *not* here: a read identity keyed on the shape. Two consumers
 * asking one connection and window for different Selections merge into one
 * requirement whose fields are the union, so one read serves both — see
 * `Requirement.mergeConnections`. An identity that included the Selection would
 * split them and fetch twice.
 */
interface ReadContract<Name extends string, Input> {
  readonly ref: QueryRef<Name, Input>
  readonly relation: RelationRequirement
  readonly requirement: QueryRequirement
}

const readContract = <Name extends string, Input, Value, Entity extends string>(
  source: QueryRef<Name, Input>,
  shape: Selection<Value, Entity>,
  window: QueryWindowOptions,
): ReadContract<Name, Input> => {
  const ref: QueryRef<Name, Input> = { ...source, window: pickWindow(window) }
  const relation = relationOf(shape)
  return {
    ref,
    relation,
    requirement: { identity: ref.identity, window: ref.window, select: relation, ref },
  }
}

/**
 * A read contract whose connection, when a client can place rows in it, also
 * reads every field its body filters and orders by: a changed row is then
 * compared with neighbours that hold those fields. What the view reads, and so
 * decodes, stays its Selection.
 */
const placeableReadContract = <Name extends string, Input>(
  contract: ReadContract<Name, Input>,
  body: Domain.AnyQuery | undefined,
  operators: MemoryOperators,
): ReadContract<Name, Input> => {
  if (body === undefined) return contract
  const { requirement, ref } = contract
  const encoded = Schema.encodeSync(ref.Input)(ref.input) as Readonly<Record<string, unknown>>
  if (Relational.placement(body, encoded, { operators })._tag !== 'Placeable') return contract
  const missing = Relational.dependencies(body).fields.filter(
    field => !requirement.select.fields.includes(field.key),
  )
  if (missing.length === 0) return contract
  return {
    ...contract,
    requirement: {
      ...requirement,
      select: {
        ...requirement.select,
        fields: [...requirement.select.fields, ...missing.map(field => field.key)],
      },
    },
  }
}

/**
 * When what a projection shows was last received, and whether it is stale
 * or loading. See `Remote.meta`.
 */
export interface ReadMeta {
  /** The newest server write among what is shown; none received reads `undefined`. */
  readonly updatedAt: number | undefined
  /** Any shown field or connection is marked stale. */
  readonly stale: boolean
  /** Any shown field or connection is in flight. */
  readonly loading: boolean
}

const metaOf = (remote: RemoteModel, asked: Asked, operators: MemoryOperators): ReadMeta => {
  const visible = visibleStoreOf(remote.entities, remote.optimistic, operators)
  let updatedAt: number | undefined
  let stale = false
  let loading = false
  const seen = new Set<string>()
  const touch = (entity: string, id: string, requirement: RelationRequirement): void => {
    const key = entityKey(entity, id)
    const memo = `${key}\u0000${stableStringify(requirement)}`
    if (seen.has(memo)) return
    seen.add(memo)
    const entry = visible[key]
    if (entry !== undefined && !entry.tombstone) {
      for (const field of requirement.fields) {
        if (!entry.present.has(field)) continue
        if (Number.isFinite(entry.updatedAt))
          updatedAt =
            updatedAt === undefined ? entry.updatedAt : Math.max(updatedAt, entry.updatedAt)
        if (entry.stale.has(field)) stale = true
      }
    }
    if (isLoadingThrough(remote, entity, id, requirement)) loading = true
    for (const [field, relation] of Object.entries(requirement.relations ?? {})) {
      const value = readField(visible, key, field)
      if (value._tag === 'None' || value.value === null || value.value === undefined) continue
      for (const ref of targetsOf(value.value, relation)) touch(ref.entity, ref.id, relation)
    }
  }
  for (const requirement of asked.requirements)
    touch(requirement.entity, requirement.id, requirement)
  for (const connection of asked.connections) {
    const known = remote.connections[connection.identity]
    if (known === undefined) {
      if (isQueryLoading(remote, connection.identity)) loading = true
      continue
    }
    // A list fetched only for a placement's check is neither, as without the check.
    if (readsStale(remote, connection.identity)) stale = true
    if (
      remote.placed[connection.identity]?.checking !== true &&
      isQueryLoading(remote, connection.identity)
    )
      loading = true
    for (const edge of visibleItems(
      known,
      connection.identity,
      remote.optimistic.overlays,
      goneIn(remote.entities, remote.optimistic),
    )) {
      if (edge.ref.entity !== connection.select.entity) continue
      touch(edge.ref.entity, edge.ref.id, connection.select)
    }
  }
  return { updatedAt, stale, loading }
}

/**
 * The store a read or plan sees: the base with every pending optimistic layer
 * applied, so a request's patches show until it settles and a temporary id is
 * not planned as a fetch.
 */
const storeOf = <AppModel, Store extends RemoteModel, Names extends string>(
  bound: BoundRemote<AppModel, Store, Names>,
  model: AppModel,
): EntityStore => {
  const remote = bound.store.get(model)
  return visibleStoreOf(remote.entities, remote.optimistic, bound.operators)
}

/**
 * The Model as it would be with nothing optimistic pending. Every read reaches
 * the layers through the Model it is given, so dropping them here is what makes
 * a read confirmed — no read has to know it is being read confirmed.
 */
const withoutOptimistic = <AppModel, Store extends RemoteModel, Names extends string>(
  bound: BoundRemote<AppModel, Store, Names>,
  model: AppModel,
): AppModel => {
  const remote = bound.store.get(model)
  return remote.optimistic.layers.length === 0 && remote.optimistic.overlays.length === 0
    ? model
    : bound.store.set(model, { ...remote, optimistic: emptyOptimistic } as Store)
}

const confirmed = <AppModel, Store extends RemoteModel, P extends Projection<AppModel, any>>(
  bound: BoundRemote<AppModel, Store>,
  projection: P,
): P => ({
  ...projection,
  read: (root: AppModel) => projection.read(withoutOptimistic(bound, root)),
})

// The visible store is recomputed only when the base store or the layers
// change, so reads and plans across renders of one Model share it. Keyed on
// the layers rather than the whole optimistic state, which also changes with
// every overlay (a live insert, a page pruning one) that no layer is part of.
// By the client's table, then the layers, then the store: a prediction depends on all three.
const visibleStores = new WeakMap<
  MemoryOperators,
  WeakMap<object, WeakMap<EntityStore, EntityStore>>
>()

const visibleStoreOf = (
  entities: EntityStore,
  optimistic: OptimisticState,
  operators: MemoryOperators,
): EntityStore => {
  let byLayers = visibleStores.get(operators)
  if (byLayers === undefined) {
    byLayers = new WeakMap()
    visibleStores.set(operators, byLayers)
  }
  let byStore = byLayers.get(optimistic.layers)
  if (byStore === undefined) {
    byStore = new WeakMap()
    byLayers.set(optimistic.layers, byStore)
  }
  let visible = byStore.get(entities)
  if (visible === undefined) {
    visible = visibleStore(entities, optimistic, operators)
    byStore.set(entities, visible)
  }
  return visible
}

// A visible store is made from one store and one set of layers, so it keys
// what is planned over it; the read entries ask on every Model change.
const plannedStores = new WeakMap<EntityStore, EntityStore>()

/** `plannedStore` of the visible store, kept by it. */
const plannedStoreOf = (
  entities: EntityStore,
  optimistic: OptimisticState,
  visible: EntityStore,
): EntityStore => {
  let planned = plannedStores.get(visible)
  if (planned === undefined) {
    planned = plannedStore(entities, visible, optimistic)
    plannedStores.set(visible, planned)
  }
  return planned
}

/**
 * `Failed` naming a field the server settled without a value, when one is
 * among what `relation` reads of the entity; otherwise nothing, and the store
 * merely lacks the value. The reason stays with the server, so a view shows
 * the field it cannot have, not why.
 */
const unavailableFailure = (
  store: EntityStore,
  key: string,
  relation: RelationRequirement,
): { readonly _tag: 'Failed'; readonly error: RemoteError } | undefined => {
  const field = unavailableOf(store, key, relation)
  return field === undefined
    ? undefined
    : {
        _tag: 'Failed',
        error: {
          _tag: 'Unavailable',
          message: `The server answered without ${field}, and will not answer with it: the field is not available to this client.`,
        },
      }
}

/**
 * A row's decoded value, kept while the data it was assembled from is the same,
 * so a refetch or live patch that brought equal data hands a view the object it
 * already rendered. Keyed on the row's own values object, which the store keeps
 * across equal writes; a relation's targets are covered by comparing what was
 * assembled.
 */
const decodedRows = new WeakMap<
  object,
  {
    readonly decode: (values: unknown) => Result.Result<unknown, Schema.SchemaError>
    readonly rows: WeakMap<object, { readonly values: unknown; readonly decoded: unknown }>
  }
>()

const decodeRow = <Value>(
  schema: Schema.Codec<Value, unknown, never, never>,
  source: object,
  values: unknown,
): Result.Result<Value, Schema.SchemaError> => {
  let bySchema = decodedRows.get(schema)
  if (bySchema === undefined) {
    bySchema = { decode: Schema.decodeUnknownResult(schema), rows: new WeakMap() }
    decodedRows.set(schema, bySchema)
  }
  const cached = bySchema.rows.get(source)
  if (cached !== undefined && sameData(cached.values, values)) {
    return cached.decoded as Result.Result<Value, Schema.SchemaError>
  }
  const decoded = bySchema.decode(values)
  bySchema.rows.set(source, { values, decoded })
  return decoded as Result.Result<Value, Schema.SchemaError>
}

interface ReadScope {
  readonly inner: WeakMap<object, ReadScope>
  readonly results: Map<string, unknown>
}

const readResults: ReadScope = { inner: new WeakMap(), results: new Map() }

// A read's result per snapshot of everything it reads. `Remote.storeOf` is
// shared across every read of one Model state, so equal reads of one render
// assemble and decode once and return one value (a view may compare by
// identity). A query read also depends on its connection and the overlays,
// which change independently of the store, so it keys on those too. Weak on
// every scope, bounded by what is read.
const memoRead = <T>(scopes: ReadonlyArray<object>, key: string, compute: () => T): T => {
  let scope = readResults
  for (const by of scopes) {
    let inner = scope.inner.get(by)
    if (inner === undefined) {
      inner = { inner: new WeakMap(), results: new Map() }
      scope.inner.set(by, inner)
    }
    scope = inner
  }
  if (scope.results.has(key)) return scope.results.get(key) as T
  const value = compute()
  scope.results.set(key, value)
  return value
}

export interface MutateOptions {
  /** What the request changes before the server answers; released when it settles. */
  readonly optimistic?: ReadonlyArray<OptimisticOperation> | undefined
  /**
   * When the reader acted, in milliseconds since the epoch, as `Remote.now`
   * read it: sent for a time the write sets, which the server takes within
   * its `clockSkew`.
   */
  readonly now?: number | undefined
}

/**
 * The default clock. It reads `Date.now` when called rather than holding the
 * function, so fake timers installed after the domain was made move it.
 */
const wallClock = (): number => Date.now()

/** The default `toMessage`: the application reduces `RemoteMessage` itself. */
const identityMessage = (message: RemoteMessage): RemoteMessage => message

export interface RetainOptions {
  /** The query connections the application shows, by `QueryRef` or identity. */
  readonly connections?: ReadonlyArray<ConnectionIdentity> | undefined
  /** How long the roots must be stable before collecting; default none. */
  readonly grace?: Duration.Input | undefined
}

/** `Remote.retain`'s options: a retain entry wired by hand says the budget itself. */
export interface RetainEntryOptions extends RetainOptions {
  /** How many entries, rows and lists, retention keeps; `defaultBudget` when not given. */
  readonly budget?: number | undefined
}

/** The budget given, refused where it is given when it counts no entries a cache can hold. */
const checkedBudget = (budget: number | undefined): number | undefined => {
  if (budget !== undefined && !(budget >= 0))
    throw new Error(
      `[foldkit-remote] budget is how many entries retention keeps, 0 or more (Infinity for no limit); got ${budget}`,
    )
  return budget
}

/** `RetentionChanged` for these roots, naming a budget only when one was given. */
const retentionChanged = (roots: RetentionRoots, budget: number | undefined): RemoteMessage =>
  budget === undefined
    ? { _tag: 'RetentionChanged', roots }
    : { _tag: 'RetentionChanged', roots, budget }

/** How `Remote.observe` and `Remote.prefetch` treat fields the store already holds. */
export interface ObserveOptions {
  /** Default `RemotePolicy.cacheFirst`. */
  readonly policy?: RemotePolicy | undefined
  /** The clock a refreshing policy reads; default `Date.now`, read at each use. */
  readonly now?: (() => number) | undefined
  /**
   * How long each read and list this entry runs waits for its answer, over
   * the client's `timeout`; one that runs out fails as a failed read does.
   */
  readonly timeout?: Duration.Input | undefined
}

/** How `Data.satisfy` reads: how many passes it may take, and the clock. */
export interface SatisfyOptions {
  /** At most this many passes over the Surfaces; default 8. */
  readonly passes?: number | undefined
  /** The clock the reads are stamped with; default `Date.now`, read at each use. */
  readonly now?: (() => number) | undefined
}

/**
 * `Data.satisfy` reached its bound with Surfaces still reading, such as a
 * chain whose every read reveals one more. It names them, so a page that
 * would have rendered them loading fails instead. (A read the server leaves
 * unanswered settles as missing and ends the loop.)
 */
export class RemoteUnsatisfied extends Schema.TaggedError<RemoteUnsatisfied>()(
  'RemoteUnsatisfied',
  { surfaces: Schema.Array(Schema.String), passes: Schema.Number },
) {}

export interface LiveOptions {
  /** The clock `LiveReceived` stamps events with; default `Date.now`, read at each use. */
  readonly now?: (() => number) | undefined
  /**
   * The first restart's delay after a stream breaks, doubled for each break in
   * a row, with ±20% jitter: Sync's transport policy. Default `50 millis`.
   */
  readonly retryBase?: Duration.Input | undefined
  /** The longest a restart waits. Default `5 seconds`. */
  readonly maxRetryDelay?: Duration.Input | undefined
}

/** A stable key for a live subscription's rows and lists. */
const liveStreamKey = ({ requirements, queries }: LiveAsk): string =>
  [
    ...requirements.map(
      requirement =>
        `${entityKey(requirement.entity, requirement.id)}:${[...requirement.fields].sort().join(',')}`,
    ),
    ...queries.map(query => stableStringify(query)),
  ]
    .sort()
    .join('|')

/** Each registered Entity's `Derived.count`s and `Derived.exists`, under the pointing Entity. */
const derivedMembersBy = (
  entities: ReadonlyArray<EntityLike>,
): ReadonlyMap<string, ReadonlyArray<DerivedBy>> => {
  const byPointing = new Map<string, Array<DerivedBy>>()
  const add = (pointing: string, member: DerivedBy): void => {
    const members = byPointing.get(pointing) ?? []
    members.push(member)
    byPointing.set(pointing, members)
  }
  for (const entity of entities) {
    if (!DomainEntity.is(entity)) continue
    const derived: Readonly<
      Record<string, Domain.EntityDerived<string, string, Schema.Constraint>>
    > = entity.derived
    for (const [field, member] of Object.entries(derived))
      Derivation.$match(member.derives, {
        Supplied: () => undefined,
        Count: ({ relation }) =>
          add(
            relation.owner.name,
            DerivedBy.Count({ relation: relation.key, owner: entity.name, field }),
          ),
        Exists: ({ relation, viewer }) =>
          add(
            relation.owner.name,
            DerivedBy.Exists({
              relation: relation.key,
              viewer: viewer.key,
              owner: entity.name,
              field,
            }),
          ),
      })
  }
  return byPointing
}

/** Declares a Remote domain: its entities, queries, and mutations, plus the submodel. */
const defineRemote = <
  const Entities extends readonly EntityLike[],
  const Queries extends readonly QueryDescriptor<any, any, any>[] = readonly QueryDescriptor<
    any,
    any,
    any
  >[],
  const Mutations extends readonly MutationDescriptor<any, any, any>[] =
    readonly MutationDescriptor<any, any, any>[],
>(config: {
  readonly entities: Entities
  readonly queries?: Queries
  readonly mutations?: Mutations
}): RemoteDescriptor<Entities, Queries, Mutations> => {
  const entities = config.entities.map(descriptorOf)
  return {
    entities: entities as unknown as Entities,
    queries: (config.queries ?? []) as unknown as Queries,
    mutations: (config.mutations ?? []) as unknown as Mutations,
    Model: remoteModelSchema(),
    initial: initialRemoteModel,
    Message: remoteMessageSchema,
    update: updateRemote,
    rpc: RemoteRpc,
    registry: {
      entities: new Map(entities.map(entity => [entity.name, entity])),
      queries: new Map((config.queries ?? []).map(query => [query.name, query])),
      mutations: new Map((config.mutations ?? []).map(mutation => [mutation.name, mutation])),
      // Read from the Entities as given: a descriptor keeps no metadata.
      filtered: new Map(
        config.entities.flatMap(entity =>
          DomainEntity.is(entity) ? [[entity.name, ReadFilter.members(entity.metadata)]] : [],
        ),
      ),
      derived: derivedMembersBy(config.entities),
    },
  }
}

/** Binds a Remote domain to its store's location in the application Model. */
const bindRemote = <
  AppModel,
  Store extends RemoteModel,
  Entities extends readonly EntityLike[],
  Queries extends readonly QueryDescriptor<any, any, any>[],
  Mutations extends readonly MutationDescriptor<any, any, any>[],
>(
  definition: RemoteDescriptor<Entities, Queries, Mutations>,
  ref: ModelRef<AppModel, Store>,
  operators: MemoryOperators,
): BoundRemote<AppModel, Store, EntityName<Entities[number]>> => {
  const store = ModelRef.focus(ref)
  return {
    definition,
    store,
    operators,
    contract: {
      kind: 'remote',
      name: store.dependency.join('.') || 'remote',
      // A generated field reference knows its application and its path; a raw
      // optic (`ModelRef.fromOptic`) knows neither, so it claims nothing.
      owner: (store as { readonly owner?: object }).owner,
      owns: store.dependency.length === 0 ? [] : [store.dependency],
      observes: store.dependency.length === 0 ? [] : [store.dependency],
      messages: [],
      metadata: [],
    },
  }
}

/** The runtime half of `Registered`: a descriptor the domain never declared is an error naming both. */
const assertRegistered = (
  bound: BoundRemote<any, any>,
  kind: 'Entity' | 'Query' | 'Mutation',
  registered: ReadonlyMap<string, unknown>,
  name: string,
): void => {
  if (!registered.has(name)) {
    throw new Error(
      `Remote: ${kind} "${name}" is not registered with domain "${bound.contract.name}"`,
    )
  }
}

/** What a projection asks of the remote: entity requirements and query connections. */
interface Asked {
  readonly requirements: ReadonlyArray<Requirement>
  readonly connections: ReadonlyArray<ConnectionRequirement>
}

const askedOf = (projection: Projection<any, unknown>): Asked => ({
  requirements: requirementsOf(projection),
  connections: connectionsOf(projection),
})

/**
 * Whether `outer` asks for everything `inner` does of one entity: each field,
 * each relation's own slice of its target, and each page window alike.
 */
const sliceCovers = (outer: RelationRequirement, inner: RelationRequirement): boolean =>
  outer.entity === inner.entity &&
  inner.fields.every(field => outer.fields.includes(field)) &&
  Object.entries(inner.relations ?? {}).every(([field, relation]) => {
    const wider = outer.relations?.[field]
    return wider !== undefined && sliceCovers(wider, relation)
  }) &&
  Object.entries(inner.windows ?? {}).every(
    ([field, window]) =>
      outer.windows?.[field] !== undefined &&
      stableStringify(outer.windows[field]) === stableStringify(window),
  )

/**
 * Whether what `outer` asks includes everything `inner` asks: each list with
 * the slice it selects of its rows, and each entity with the slice it reads,
 * relations included. A Surface that shows a read is one whose projection
 * asks for all of it; one that reads part of it cannot be why it is fetched.
 * A Surface that asks for one entity in several pieces is already one
 * requirement here: projection metadata unions them per entity and id.
 */
const covers = (outer: Asked, inner: Asked): boolean => {
  const { connections, requirements } = outer
  return (
    inner.connections.every(connection =>
      connections.some(
        wider =>
          wider.identity === connection.identity &&
          (connection.select === undefined ||
            (wider.select !== undefined && sliceCovers(wider.select, connection.select))),
      ),
    ) &&
    inner.requirements.every(requirement =>
      requirements.some(wider => wider.id === requirement.id && sliceCovers(wider, requirement)),
    )
  )
}

/** When held rows and lists next age out under a freshness. */
export interface ReadDeadline extends Deadline {
  /** Held lists that age out then, by identity. */
  readonly connections: ReadonlyArray<string>
}

/** The plan for what a projection asks: the entity fields to read, and the queries to run. */
interface Planned {
  readonly requirements: ReadonlyArray<Requirement>
  readonly queries: ReadonlyArray<QueryRequirement>
  /** Held lists among `queries` asked for whole, which read `Refreshing` while they are. */
  readonly refreshing: ReadonlyArray<string>
  /** Under a freshness, when what is held next goes stale; `null` when nothing held will. */
  readonly expires: ReadDeadline | null
}

/** The earlier of two deadlines, or both joined when they fall together. */
const earlier = (a: ReadDeadline | null, b: ReadDeadline | null): ReadDeadline | null => {
  if (a === null || b === null) return a ?? b
  if (a.at !== b.at) return a.at < b.at ? a : b
  return {
    at: a.at,
    due: Requirement.merge([...a.due, ...b.due]),
    connections: [...a.connections, ...b.connections],
  }
}

/**
 * Plans what a projection asks against the Model. A connection the Model holds
 * fresh contributes its visible items' selected fields to the entity plan; one
 * it does not hold, or holds stale, is a query to run (its items are planned
 * once the page arrives).
 *
 * A connection whose query failed is not run again here, short of `force`: the
 * failure is what its read shows, and retrying is `Remote.refresh`'s to ask
 * for. The rows it already holds are still planned, since they are on screen.
 */
/**
 * One requirement per connection and direction: of the sized windows reading
 * a connection from its start (or end), the widest, which covers the rest.
 * Windows with a cursor are pages of their own and stay as they are.
 */
const widest = (
  remote: RemoteModel,
  connections: ReadonlyArray<QueryRequirement>,
): ReadonlyArray<QueryRequirement> => {
  const kept = new Map<string, QueryRequirement>()
  const rest: QueryRequirement[] = []
  for (const connection of connections) {
    const size = windowSize(remote, connection)
    if (size === undefined) {
      rest.push(connection)
      continue
    }
    const key = `${connection.identity}${String.fromCharCode(0)}${connection.window.first === undefined ? 'last' : 'first'}`
    const current = kept.get(key)
    if (current === undefined) kept.set(key, connection)
    else if (size > (windowSize(remote, current) ?? 0))
      kept.set(key, {
        ...connection,
        select: Requirement.mergeRelation(current.select, connection.select),
      })
    else
      kept.set(key, {
        ...current,
        select: Requirement.mergeRelation(current.select, connection.select),
      })
  }
  return [...kept.values(), ...rest]
}

const withWindow = (connection: QueryRequirement, window: QueryWindow): QueryRequirement => ({
  ...connection,
  window,
  ref: { ...connection.ref, window },
})

/**
 * The page a connection lacks for a window of `size` from its start (or end):
 * the rows after its first segment's end cursor (or before its last's start).
 * Undefined when it holds enough, reaches the end, or does not know where it
 * starts.
 */
const missingRows = (
  known: Connection,
  window: QueryWindow,
  size: number,
): QueryWindow | undefined => {
  const forward = window.first !== undefined
  const segment = forward ? known.segments[0] : known.segments[known.segments.length - 1]
  if (segment === undefined) return undefined
  const [from, to] = forward ? [segment.start, segment.end] : [segment.end, segment.start]
  if (from._tag !== 'Terminal' || to._tag !== 'Cursor' || segment.edges.length >= size)
    return undefined
  const lacking = size - segment.edges.length
  return forward ? { first: lacking, after: to.cursor } : { last: lacking, before: to.cursor }
}

const planAsked = (
  remote: RemoteModel,
  asked: Asked,
  options: PlanOptions,
  operators: MemoryOperators,
): Planned => {
  const queries: QueryRequirement[] = []
  const refreshing: string[] = []
  const items: Requirement[] = []
  const { freshness } = options
  let listsExpire: ReadDeadline | null = null
  const connections = Requirement.mergeConnections(
    asked.connections,
  ) as ReadonlyArray<QueryRequirement>
  for (const connection of widest(remote, connections)) {
    const known = remote.connections[connection.identity]
    const failed = options.force !== true && connection.identity in remote.failures.connections
    const size = windowSize(remote, connection)
    // Under a freshness a list ages as a row does, from the page that last
    // answered it whole.
    const expires =
      freshness === undefined || known === undefined
        ? undefined
        : known.receivedAt + freshness.freshness
    const aged = freshness !== undefined && expires !== undefined && freshness.now > expires
    if (!failed && (known === undefined || known.stale || aged || options.force === true)) {
      queries.push(
        size === undefined
          ? connection
          : withWindow(
              connection,
              connection.window.first === undefined ? { last: size } : { first: size },
            ),
      )
      if (known !== undefined && known.segments.length > 0) refreshing.push(connection.identity)
      continue
    }
    if (known === undefined) continue
    // A failed list is not asked again on its own, so no clock waits on it.
    if (!failed && expires !== undefined && Number.isFinite(expires))
      listsExpire = earlier(listsExpire, {
        at: expires,
        due: [],
        connections: [connection.identity],
      })
    // A wider window than the connection holds asks for the rows it lacks.
    const tail =
      failed || size === undefined ? undefined : missingRows(known, connection.window, size)
    if (tail !== undefined) queries.push(withWindow(connection, tail))
    const edges = visibleItems(
      known,
      connection.identity,
      remote.optimistic.overlays,
      goneIn(remote.entities, remote.optimistic),
    )
    items.push(
      ...itemsOf(
        edges.map(edge => edge.ref),
        connection.select,
      ),
    )
  }
  const visible = visibleStoreOf(remote.entities, remote.optimistic, operators)
  const read = [...asked.requirements, ...items]
  const held = heldOnlyByRequests(remote.entities, remote.optimistic)
  const planned = plan(plannedStoreOf(remote.entities, remote.optimistic, visible), read, options)
  const sent = planned.filter(
    requirement => !held.has(entityKey(requirement.entity, requirement.id)),
  )
  const rowsExpire = freshness === undefined ? undefined : deadlineOf(visible, read, freshness)
  return {
    requirements: options.force === true ? sent : withoutFailedFields(remote, sent),
    queries,
    refreshing,
    expires: earlier(
      rowsExpire === undefined ? null : { ...rowsExpire, connections: [] },
      listsExpire,
    ),
  }
}

/**
 * The plan without the fields whose last read failed. Like a failed query,
 * a failed field is shown rather than retried on its own, so a persistent
 * error is not asked again on every unrelated restart of the read entry. A
 * field leaving the request takes its window and its relation with it.
 */
const withoutFailedFields = (
  remote: RemoteModel,
  planned: ReadonlyArray<Requirement>,
): ReadonlyArray<Requirement> => {
  if (Object.keys(remote.failures.fields).length === 0) return planned
  return planned.flatMap(requirement => {
    const fields = requirement.fields.filter(
      field => !isFieldFailed(remote, requirement.entity, requirement.id, field),
    )
    if (fields.length === requirement.fields.length) return [requirement]
    if (fields.length === 0) return []
    const kept = new Set(fields)
    const only = <T>(record: Readonly<Record<string, T>> | undefined) =>
      record === undefined
        ? undefined
        : Object.fromEntries(Object.entries(record).filter(([field]) => kept.has(field)))
    const windows = only(requirement.windows)
    const relations = only(requirement.relations)
    return [
      {
        entity: requirement.entity,
        id: requirement.id,
        fields,
        ...(windows === undefined || Object.keys(windows).length === 0 ? {} : { windows }),
        ...(relations === undefined || Object.keys(relations).length === 0 ? {} : { relations }),
        ...(requirement.live === undefined ? {} : { live: requirement.live }),
      },
    ]
  })
}

/** The entity requirements a page's edges add under a selection. */
const itemsOf = (
  edges: ReadonlyArray<{ readonly entity: string; readonly id: string }>,
  select: RelationRequirement,
): ReadonlyArray<Requirement> =>
  edges.filter(edge => edge.entity === select.entity).map(edge => ({ ...select, id: edge.id }))

/**
 * The wire request of a planned query; a `QueryRef` identity carries the query
 * name and the canonical encoded input. A connection requirement built by hand
 * with another identity cannot be run, and fails as a query would.
 */
const parsedQueryRequest = (query: {
  readonly identity: string
  readonly window: QueryWindow
  readonly select?: RelationRequirement | undefined
}): Result.Result<Schema.Schema.Type<typeof QueryRequest>, RemoteQueryError> => {
  const separator = query.identity.indexOf('\u0000')
  if (separator < 0) {
    return Result.fail(
      new RemoteQueryError({
        message: `connection "${query.identity}" is not a query's: only a QueryRef identity can be run`,
      }),
    )
  }
  try {
    return Result.succeed({
      query: query.identity.slice(0, separator),
      input: JSON.parse(query.identity.slice(separator + 1)) as unknown,
      window: query.window,
      ...(query.select === undefined ? {} : { select: query.select }),
    })
  } catch {
    return Result.fail(
      new RemoteQueryError({ message: `connection "${query.identity}" carries no encoded input` }),
    )
  }
}

const queryRequestOf = (
  query: Parameters<typeof parsedQueryRequest>[0],
): Effect.Effect<Schema.Schema.Type<typeof QueryRequest>, RemoteQueryError> =>
  Effect.suspend(() =>
    Result.match(parsedQueryRequest(query), { onFailure: Effect.fail, onSuccess: Effect.succeed }),
  )

/** What a live stream subscribes to: rows, and lists as their reads send them. */
interface LiveAsk {
  readonly requirements: ReadonlyArray<Requirement>
  readonly queries: ReadonlyArray<Schema.Schema.Type<typeof QueryRequest>>
}

/**
 * The live rows and lists of what projections ask. A list read live is a
 * `Data.query`, whose identity is always a query's, so one that is not is
 * this package's bug, and throws.
 */
const liveAskOf = (asked: Asked): LiveAsk => ({
  requirements: asked.requirements.filter(requirement => requirement.live === true),
  queries: asked.connections.flatMap(connection =>
    connection.live === true ? [Result.getOrThrow(parsedQueryRequest(connection))] : [],
  ),
})

/**
 * The `ConnectionMerged` for a query result, in the client's edge shape.
 * `refreshes` marks the page as answering the connection's refresh, so one
 * Message both merges it and clears `stale`.
 */
/**
 * The page a window asked for, or the number of edges that came back instead.
 *
 * A window is a request the client made and the server answered, so more edges
 * than were asked for is a protocol disagreement rather than a windfall: the
 * client cannot tell which of them the window meant, the connection's
 * boundaries stop describing what it holds, and a `first: 25` that quietly
 * becomes a thousand is a memory event with no error attached to it.
 *
 * `undefined` when the page is within its window, or when no size was asked
 * for — `after`/`before` with no `first`/`last` bounds nothing.
 */
const overrun = (
  window: QueryWindow,
  edges: ReadonlyArray<unknown>,
): { readonly asked: number; readonly got: number } | undefined => {
  const asked = window.first ?? window.last
  return asked !== undefined && edges.length > asked ? { asked, got: edges.length } : undefined
}

const pageMessage = (
  connection: string,
  result: Schema.Schema.Type<typeof QueryResult>,
  refreshes = false,
  window: QueryWindow = {},
  select?: RelationRequirement | undefined,
  now?: number | undefined,
): RemoteMessage => {
  // Failed the way any query fails, with a named protocol error, rather than
  // the page being silently accepted or an exception escaping a subscription.
  const over = overrun(window, result.edges)
  if (over !== undefined) {
    return {
      _tag: 'QueryFailed',
      connection,
      error: {
        _tag: 'RemoteProtocolError',
        message: `the server returned ${over.got} edges for a window of ${over.asked}`,
      },
    }
  }
  const hasPayload =
    select !== undefined &&
    ((result.entities !== undefined && result.entities.length > 0) ||
      (result.settled !== undefined && result.settled.length > 0))
  return {
    _tag: 'ConnectionMerged',
    connection,
    page: {
      edges: result.edges.map(edge => ({
        key: edge.key,
        ref: { entity: edge.entity, id: edge.id },
      })),
      start: result.start,
      end: result.end,
    },
    ...(refreshes ? { refreshes } : {}),
    ...(select === undefined || !hasPayload ? {} : { select }),
    ...(hasPayload
      ? {
          entities: [...(result.entities ?? [])],
          settled: [...(result.settled ?? [])],
          now: now ?? 0,
        }
      : {}),
  }
}

/**
 * The retention roots of some projections: their requirements, their
 * connections (each with the union of what the projections select of its
 * items), and the connections listed by identity alone.
 */
const rootsOf = (
  projections: ReadonlyArray<Projection<any, unknown>>,
  options: RetainOptions,
): RetentionRoots => {
  const connections = new Map<string, ConnectionRoot>()
  for (const identity of (options.connections ?? []).map(connectionIdentity)) {
    connections.set(identity, { identity })
  }
  for (const { identity, select } of projections.flatMap(connectionsOf)) {
    const current = connections.get(identity)?.select
    connections.set(identity, {
      identity,
      select: current === undefined ? select : Requirement.mergeRelation(current, select),
    })
  }
  return {
    requirements: Requirement.merge(projections.flatMap(requirementsOf)),
    connections: [...connections.values()].sort((a, b) => (a.identity < b.identity ? -1 : 1)),
  }
}

/** Reads requirements and reports the Message that settles them. Never fails. */
const readMessage = (
  requirements: ReadonlyArray<Requirement>,
  now: () => number,
): Effect.Effect<RemoteMessage, never, RemoteClient> =>
  Effect.gen(function* () {
    const client = yield* RemoteClient
    const at = now()
    const result = yield* Effect.result(
      client.read({ version: REMOTE_PROTOCOL_VERSION, requests: requirements }),
    )
    return Result.isFailure(result)
      ? { _tag: 'ReadFailed', requests: requirements, error: remoteError(result.failure) }
      : { _tag: 'ReadReceived', requests: requirements, result: result.success, now: at }
  })

/** Runs a query and reports the page that refreshes its connection, or the failure. Never fails. */
const queryMessage = (
  query: {
    readonly identity: string
    readonly window: QueryWindow
    readonly select?: RelationRequirement | undefined
  },
  now: () => number = wallClock,
): Effect.Effect<RemoteMessage, never, RemoteClient> =>
  Effect.gen(function* () {
    const client = yield* RemoteClient
    const result = yield* Effect.result(
      queryRequestOf(query).pipe(Effect.flatMap(request => client.query(request))),
    )
    return Result.isFailure(result)
      ? { _tag: 'QueryFailed', connection: query.identity, error: remoteError(result.failure) }
      : pageMessage(query.identity, result.success, true, query.window, query.select, now())
  })

/** A query the read entry runs, as its dependencies carry it: plain data Foldkit compares. */
const PlannedQuery = Schema.Struct({
  identity: Schema.String,
  window: WindowSchema,
  select: RelationRequest,
})

/** The dependencies of the read entry: the entity fields to read and the queries to run. */
export interface ReadDependencies {
  readonly requirements: ReadonlyArray<Requirement>
  readonly queries: ReadonlyArray<Schema.Schema.Type<typeof PlannedQuery>>
  /**
   * The highest generation the fields this entry reads were refreshed at: a
   * refresh of any of them restarts the entry, and a refresh of anything else
   * leaves it running.
   */
  readonly refresh: number
  /**
   * Held lists the entry queries whole: under a refreshing policy its
   * `RefreshStarted` marks them stale, so each reads `Refreshing` with its
   * rows and the page answering it replaces them.
   */
  readonly refreshing: ReadonlyArray<string>
  /**
   * Under a refreshing policy, when a value the entry holds next ages out and
   * what is due then. Time reaches Remote only as a Message: the entry sleeps
   * until then and emits `RefreshStarted`, which marks the fields and lists
   * stale, and the plan that follows fetches them. A Model that does not
   * change past its `maxAge` is otherwise never looked at again.
   */
  readonly expires: ReadDeadline | null
}

/** `RefreshStarted` for these fields and lists, naming lists only when there are some. */
const refreshStarted = (
  requests: ReadonlyArray<Requirement>,
  connections: ReadonlyArray<string>,
): RemoteMessage =>
  connections.length === 0
    ? { _tag: 'RefreshStarted', requests }
    : { _tag: 'RefreshStarted', requests, connections }

/**
 * The read entry: plans what `askedOf(model)` asks against the Model and runs
 * the entity read and the queries concurrently. Each Message it emits changes
 * the Model, so Foldkit recomputes the dependencies and restarts the stream
 * (`switchMap`): a merged page's items are planned by that next computation,
 * against the store as it then is, rather than read here unplanned. Nothing
 * the entry needs is spread over two Messages, since the second could be lost
 * to the restart; a page and its refresh are one `ConnectionMerged`.
 */
const observeEntry = <AppModel, Store extends RemoteModel, Message>(
  bound: BoundRemote<AppModel, Store>,
  askedOf: (model: AppModel) => Asked,
  toMessage: (message: RemoteMessage) => Message,
  options: ObserveOptions,
): EntryWithoutKeepAlive<AppModel, Message, ReadDependencies, RemoteClient> => {
  const { policy = RemotePolicy.cacheFirst, now = wallClock, timeout } = options
  const read = (requirements: ReadonlyArray<Requirement>) =>
    Effect.map(withCallTimeout(readMessage(requirements, now), timeout), toMessage)
  const run = (query: ReadDependencies['queries'][number]) =>
    Effect.map(withCallTimeout(queryMessage(query, now), timeout), toMessage)
  // A plan is a function of the Remote model, what is asked, and the clock only
  // until the next value ages out (`expires`, which `deadlineOf` computes as
  // exactly that moment), so a Model change the Remote model is not part of
  // (typing in a field) reuses it rather than walking every row again.
  const planned = new WeakMap<
    RemoteModel,
    Map<string, { readonly until: number; readonly dependencies: ReadDependencies }>
  >()
  return {
    dependenciesSchema: Schema.Struct({
      requirements: Schema.Array(ReadRequest),
      queries: Schema.Array(PlannedQuery),
      refresh: Schema.Number,
      refreshing: Schema.Array(Schema.String),
      expires: Schema.NullOr(
        Schema.Struct({
          at: Schema.Number,
          due: Schema.Array(ReadRequest),
          connections: Schema.Array(Schema.String),
        }),
      ),
    }),
    modelToDependencies: model => {
      const remote = bound.store.get(model)
      const asked = askedOf(model)
      const askedKey = stableStringify(asked)
      const at = now()
      let byAsked = planned.get(remote)
      const known = byAsked?.get(askedKey)
      if (known !== undefined && at < known.until) return known.dependencies
      const plan = planAsked(remote, asked, RemotePolicy.toPlan(policy, at), bound.operators)
      const dependencies: ReadDependencies = {
        refresh: refreshedAt(
          remote.refresh,
          plan.requirements,
          plan.queries.map(query => query.identity),
        ),
        requirements: plan.requirements,
        queries: plan.queries.map(({ identity, window, select }) => ({
          identity,
          window,
          select,
        })),
        refreshing: plan.refreshing,
        expires: plan.expires,
      }
      if (byAsked === undefined) {
        byAsked = new Map()
        planned.set(remote, byAsked)
      }
      byAsked.set(askedKey, { until: plan.expires?.at ?? Infinity, dependencies })
      return dependencies
    },
    dependenciesToStream: ({ requirements, queries, refresh, refreshing, expires }) =>
      Stream.concat(
        Stream.fromIterable([
          // Absent fields read as `Loading` until the read lands.
          ...(requirements.length === 0
            ? []
            : [toMessage({ _tag: 'ReadStarted', requests: requirements, refresh })]),
          // A refreshing policy also marks the present fields, and the held
          // lists it asks for whole, stale.
          ...(RemotePolicy.refreshes(policy) && (requirements.length > 0 || refreshing.length > 0)
            ? [toMessage(refreshStarted(requirements, refreshing))]
            : []),
          // A list with nothing to show reads `Loading` until its page lands.
          ...(queries.length === 0
            ? []
            : [
                toMessage({
                  _tag: 'QueryStarted',
                  connections: queries.map(query => query.identity),
                }),
              ]),
        ]),
        Stream.merge(
          Stream.mergeAll(
            [
              ...(requirements.length === 0 ? [] : [Stream.fromEffect(read(requirements))]),
              ...queries.map(query => Stream.fromEffect(run(query))),
            ],
            { concurrency: 'unbounded' },
          ),
          // The clock's say, as a Message. Under the Effect clock, so a test
          // can move it; against `now`, so the same clock sets and fires it.
          expires === null
            ? Stream.empty
            : Stream.fromEffect(
                Effect.as(
                  Effect.sleep(Math.max(0, expires.at - now())),
                  toMessage(refreshStarted(expires.due, expires.connections)),
                ),
              ),
        ),
      ),
  }
}

// Where a restarted stream resumes, not a reason to restart it: every applied
// event advances the cursor, and a restart per event would close and reopen
// the server stream each time. Said in the schema rather than with Foldkit's
// `keepAliveEquivalence`, which would change the entry's public type
// (`EntryWithoutKeepAlive`, the only entry type Foldkit exports) for every
// application that spreads Remote's entries into its own.
const resumeCursor = Schema.Number.pipe(Schema.overrideToEquivalence(() => () => true))

/** The wait before a stream's restart after `failures` breaks in a row: Sync's transport backoff. */
const restartDelay = (options: LiveOptions, failures: number): Duration.Duration => {
  const base = Duration.toMillis(Duration.fromInputUnsafe(options.retryBase ?? '50 millis'))
  const max = Duration.toMillis(Duration.fromInputUnsafe(options.maxRetryDelay ?? '5 seconds'))
  const backoff = Math.min(max, base * 2 ** Math.min(Math.max(failures, 1) - 1, 30))
  return Duration.millis(backoff * (0.8 + Math.random() * 0.4))
}

/** The live entry: subscribes to `liveOf(model)` from the Model's resume cursor. */
const liveEntry = <AppModel, Store extends RemoteModel, Message>(
  bound: BoundRemote<AppModel, Store>,
  liveOf: (model: AppModel) => LiveAsk,
  toMessage: (message: RemoteMessage) => Message,
  options: LiveOptions,
): EntryWithoutKeepAlive<AppModel, Message, LiveDependencies, RemoteClient> => ({
  dependenciesSchema: Schema.Struct({
    requirements: Schema.Array(ReadRequest),
    queries: Schema.Array(QueryRequest),
    cursor: resumeCursor,
    floor: Schema.Number,
    restarts: Schema.Number,
    // Read when a break restarts the stream; an applied event resetting it is no reason to.
    failures: resumeCursor,
  }),
  modelToDependencies: model => {
    const asked = liveOf(model)
    const stream = liveStreamKey(asked)
    const remote = bound.store.get(model)
    const health = remote.streams[stream]
    return {
      requirements: asked.requirements,
      queries: asked.queries,
      cursor: remote.live[stream]?.cursor ?? 0,
      // A stream is the principal's: `forget` moves the floor, and it restarts.
      floor: remote.refresh.floor,
      restarts: health?.restarts ?? 0,
      failures: health?.failures ?? 0,
    }
  },
  dependenciesToStream: ({ requirements, queries, cursor, restarts, failures }) => {
    if (requirements.length === 0 && queries.length === 0) return Stream.empty
    const stream = liveStreamKey({ requirements, queries })
    const live = Stream.unwrap(
      Effect.gen(function* () {
        const client = yield* RemoteClient
        return client.live({ requirements, queries, after: cursor })
      }),
    ).pipe(
      Stream.map(event =>
        toMessage({
          _tag: 'LiveReceived',
          stream,
          event,
          now: (options.now ?? wallClock)(),
        }),
      ),
      Stream.catchIf(
        (
          _error,
        ): _error is
          | RemoteLiveError
          | RemoteLiveRefused
          | RemoteProtocolError
          | RemoteUnauthenticated => true,
        error =>
          Stream.succeed(
            toMessage({
              _tag: 'ReadFailed',
              requests: requirements,
              error: remoteError(error),
              stream,
            }),
          ),
      ),
    )
    if (restarts === 0) return live
    // The server replays nothing a stream missed while it was down, so a
    // restart refetches what the stream covers. The gap closes before the
    // resubscribe, so a resubscribe that fails is a break of its own; were the
    // two concurrent, its failure could land on the open gap and be ignored,
    // and the late `GapCleared` would leave the stream stopped.
    return Stream.fromEffect(Effect.sleep(restartDelay(options, failures))).pipe(
      Stream.drain,
      Stream.concat(
        Stream.make(
          toMessage({ _tag: 'RefreshStarted', requests: requirements }),
          toMessage({ _tag: 'GapCleared', stream }),
        ),
      ),
      Stream.concat(live),
    )
  },
})

/** The projection an active entry has for this Model; none while it is inactive. */
const projectionOf = <AppModel>(
  entry: ActiveEntry<AppModel>,
  model: AppModel,
): Option.Option<Projection<AppModel, unknown>> => {
  if ('projectionOf' in entry) return entry.projectionOf(model)
  // A bare Surface without params reads whole; a source without `instancesOf`
  // cannot happen, and resolves to nothing if it does.
  if ('projection' in entry) return Option.some(entry.projection())
  return Option.none()
}

/** One of an entry's reads, named for diagnostics: a lone Surface keeps its name, a family instance takes `Child[key]`. */
interface NamedProjection<AppModel> {
  readonly name: string
  readonly projection: Projection<AppModel, unknown>
}

/**
 * Every projection an entry resolves to for a Model: the lone one of a
 * `Surface.at`/`Surface.when` value or a bare Surface, or a family's parent
 * first and then each instance. The parent joins so an unloaded parent is
 * fetched before what it reveals; `Data.satisfy` reaches the instances in a
 * later pass. A caller that also passes the parent separately double-covers
 * its requirements, as overlapping Surfaces already do.
 */
const resolvedOf = <AppModel>(
  entry: ActiveEntry<AppModel>,
  model: AppModel,
): ReadonlyArray<NamedProjection<AppModel>> => {
  const source = entry as Partial<SurfaceSource<AppModel>>
  if (typeof source.instancesOf === 'function') {
    const instances = source.instancesOf(model)
    const from = (entry as { readonly from?: ActiveSurface<AppModel> }).from
    // A lone `Surface.at`/`Surface.when` keeps its name; a family names each
    // instance after its key, with the parent first.
    if (from === undefined)
      return instances.map(instance => ({ name: entry.name, projection: instance.projection }))
    return [
      ...Option.toArray(from.projectionOf(model)).map(projection => ({
        name: from.name,
        projection,
      })),
      ...instances.map(instance => ({
        name: `${entry.name}[${instance.key}]`,
        projection: instance.projection,
      })),
    ]
  }
  return Option.toArray(projectionOf(entry, model)).map(projection => ({
    name: entry.name,
    projection,
  }))
}

/** What some projections ask for together: their requirements and connections unioned. */
const askedUnion = (projections: ReadonlyArray<Projection<any, unknown>>): Asked => ({
  requirements: projections.flatMap(requirementsOf),
  connections: projections.flatMap(connectionsOf),
})

/**
 * `resolvedOf` computed once per Model: the read, live, and retain entries
 * all derive their dependencies from the same projections on the same Model
 * change, and a Surface's `model` callback (which lifts and builds schemas)
 * need not run three times for it. Models are objects, so the memo is weak.
 */
const memoizedResolved = <AppModel>(
  entry: ActiveEntry<AppModel>,
): ((model: AppModel) => ReadonlyArray<NamedProjection<AppModel>>) => {
  const cache = new WeakMap<object, ReadonlyArray<NamedProjection<AppModel>>>()
  return model => {
    const key: unknown = model
    if (typeof key !== 'object' || key === null) return resolvedOf(entry, model)
    const known = cache.get(key)
    if (known !== undefined) return known
    const resolved = resolvedOf(entry, model)
    cache.set(key, resolved)
    return resolved
  }
}

/**
 * What `Data.refresh` asks again: a projection, a Surface without params, one
 * entry of the active record (a `Surface.at`/`Surface.when` value, a family),
 * the whole record, or one list by its query and input (`Everyone.ref({})`),
 * whatever window reads it.
 */
export type RefreshTarget<AppModel, Queries extends string = string> =
  | Projection<AppModel, unknown>
  | ActiveEntry<AppModel>
  | Readonly<Record<string, ActiveEntry<AppModel>>>
  | QueryRef<Queries, any>

/** How `Data.refresh` asks again. */
export interface RefreshOptions {
  /** Only what failed: a "Try again" leaves what loaded as it is. */
  readonly failed?: boolean | undefined
}

/** Why the server refused a write, as `mutation` declares it: none for any other failure, or one that does not decode. */
const refusalOf = <Refused>(
  error: RemoteError,
  mutation: MutationDescriptor<string, any, any, Refused>,
): Option.Option<Refused> =>
  error.refusal === undefined
    ? Option.none()
    : Schema.decodeUnknownOption(mutation.Refusal)(error.refusal)

/** Refuses an entry of another application: two can share a Model type, and the owner token tells them apart. */
const assertOwnedBy = <AppModel>(contract: Contract, entry: ActiveEntry<AppModel>): void => {
  if (contract.owner === undefined) return
  const from = (entry as { readonly from?: ActiveSurface<AppModel> }).from
  for (const surface of from === undefined ? [entry] : [entry, from]) {
    if (surface.owner !== contract.owner) {
      throw new Error(
        `Remote: Surface "${surface.name}" belongs to another application than domain "${contract.name}"`,
      )
    }
  }
}

/** Whether a refresh target is one list by its query and input. */
const isQueryRef = <AppModel>(target: RefreshTarget<AppModel>): target is QueryRef<string, any> =>
  // No projection or entry has an identity, and a record's values are entries,
  // never strings, so a record keyed `identity` cannot pass for a ref.
  typeof (target as Partial<Record<'identity', unknown>>).identity === 'string'

/** Whether a refresh target is a projection, the one kind that is not a Surface. */
const isProjection = <AppModel>(
  target: RefreshTarget<AppModel>,
): target is Projection<AppModel, unknown> =>
  typeof (target as Partial<Record<'read', unknown>>).read === 'function'

/** Whether a refresh target is one entry of an active record rather than the record. */
const isActiveEntry = <AppModel>(
  target: ActiveEntry<AppModel> | Readonly<Record<string, ActiveEntry<AppModel>>>,
): target is ActiveEntry<AppModel> => {
  // A record's values are entries, never functions, so a key that happens to
  // be named like a member cannot pass for one.
  const members = target as Partial<Record<'projection' | 'projectionOf' | 'instancesOf', unknown>>
  return (
    typeof members.projectionOf === 'function' ||
    typeof members.instancesOf === 'function' ||
    typeof members.projection === 'function'
  )
}

/** Every projection a refresh target reads for this Model, each entry resolved as the read entries resolve it. */
const targetProjections = <AppModel>(
  contract: Contract,
  target: Exclude<RefreshTarget<AppModel>, QueryRef<string, any>>,
  model: AppModel,
): ReadonlyArray<Projection<AppModel, unknown>> => {
  if (isProjection(target)) return [target]
  const entries = isActiveEntry(target) ? [target] : Object.values(target)
  // Checked before any is resolved, so a refused call reads nothing.
  for (const entry of entries) assertOwnedBy(contract, entry)
  return entries.flatMap(entry => resolvedOf(entry, model).map(({ projection }) => projection))
}

export const Remote = {
  /** The submodel's schema, the same for every domain; embed it in the application Model. */
  Model: remoteModelSchema(),
  /** The submodel's initial value. */
  initial: initialRemoteModel,
  /**
   * Remote's Message cases for `defineMessageUnion`: spread them into the
   * application's union, and reduce the ones `Remote.reduces` recognizes with
   * `RemoteDomain.reduce`.
   */
  messages: remoteMessageCases,
  /** Whether a Message is one of Remote's, by tag. */
  reduces: isRemoteMessage,
  /**
   * Remote's Messages as one Schema, for a wrapper variant in the
   * application's union: `GotRemoteMessage: { message: Remote.Message }`. With
   * a wrapper, `update` matches the application's union exhaustively and
   * `Remote.fold` reduces what arrives inside it.
   */
  Message: defineMessageUnion(remoteMessageCases),
  /**
   * A bound domain under one wrapper variant of the application's union, the
   * same shape Foldkit gives a Submodel: `toParentMessage` wraps Remote's
   * Messages, the fold reduces them, and its `fetch`, `mutate`, and
   * `subscriptions` yield the wrapper. Spreading `Remote.messages` and
   * narrowing with `Remote.reduces` remains the shorter path for an
   * application whose `update` only reduces.
   *
   * @example
   * ```ts
   * const Message = defineMessageUnion({ GotRemoteMessage: { message: Remote.Message } })
   * const foldData = Remote.fold(Data, message => Message.GotRemoteMessage({ message }))
   *
   * const update = (model: Model, message: Message): Return =>
   *   Message.match(message, {
   *     GotRemoteMessage: ({ message }) => foldData(model, message),
   *   })
   * const subscriptions = Subscription.make<Model, Message, RemoteClient>()(() =>
   *   foldData.subscriptions({ page: Surface.at(ProjectPage, …) }),
   * )
   * ```
   */
  fold: <Domain extends RemoteDomain<any, any, any, any, any>, ParentMessage>(
    domain: Domain,
    toParentMessage: (message: RemoteMessage) => ParentMessage,
  ): RemoteFold<ModelOfDomain<Domain>, ParentMessage, Domain> => {
    type AppModel = ModelOfDomain<Domain>
    // The application's own update receives every Remote Message here, so it hears each failure.
    const fold = (model: AppModel, message: RemoteMessage | RemoteMessageInput) => {
      const reduced = reduceReporting(domain.store, domain.reduce, model, message, true)
      return {
        model: reduced.model,
        commands: (reduced.commands ?? []).map(command => mapMessage(command, toParentMessage)),
      }
    }
    return Object.assign(fold, {
      mutate: (...args: Parameters<Domain['mutate']>) => {
        const started = domain.mutate(
          ...(args as Parameters<RemoteDomain<AppModel, any, any, any, any>['mutate']>),
        )
        return { ...started, command: mapMessage(started.command, toParentMessage) }
      },
      retry: (...args: Parameters<Domain['retry']>) =>
        Option.map(
          domain.retry(
            ...(args as Parameters<RemoteDomain<AppModel, any, any, any, any>['retry']>),
          ),
          started => ({ ...started, command: mapMessage(started.command, toParentMessage) }),
        ),
      preload: (...args: Parameters<Domain['preload']>) =>
        mapMessage(
          domain.preload(
            ...(args as Parameters<RemoteDomain<AppModel, any, any, any, any>['preload']>),
          ),
          toParentMessage,
        ),
      subscriptions: (
        active: Readonly<Record<string, ActiveEntry<AppModel>>>,
        options?: SubscriptionsOptions,
      ) =>
        markAll(
          messagesAs(brandEntries(domain.subscriptions(active, options)), toParentMessage),
        ) as never,
    })
  },

  /**
   * A patch of one entity's values, for a mutation's `optimistic` list or an
   * overlay. Takes a `foldkit-entity` Entity or a Remote descriptor alike, so
   * the domain you declared once is the one you patch:
   * `Remote.patch(Project, 'p1', { name: 'Apollo II' })`. Values are the
   * fields' wire shape, as the server writes them, except a relation, which is
   * a ref (`owner: Remote.ref(User, 'u1')`), an array of refs, or `null` where
   * it is optional. A ref key typed by hand, or a ref to another Entity, is
   * refused, in the type and when the patch is made.
   */
  patch: <E extends EntityLike>(
    entity: E,
    id: string,
    values: PatchValues<FieldsOf<E>>,
  ): EntityPatch<NameOf<E>, FieldsOf<E>> => {
    const descriptor = descriptorOf(entity)
    return descriptor.patch(id, wireValues(descriptor, values)) as EntityPatch<
      NameOf<E>,
      FieldsOf<E>
    >
  },

  /**
   * A deletion of one entity, for a mutation's `optimistic` list or an
   * overlay: `Remote.tombstone(Post, 'p1')`. Until it settles the row reads
   * `NotFound` and leaves every list and relation, as an answer's `deleted`
   * does; a failure brings it back. Keeping it gone is the answer's to say.
   */
  tombstone: <E extends EntityLike>(entity: E, id: string): PendingDelete => ({
    _tag: 'Delete',
    ...descriptorOf(entity).ref(id),
  }),

  /**
   * A reference to one entity, for `ConnectionChange` and anything else that
   * names a row: `Remote.ref(Project, 'p3')`. Either kind of entity, as with
   * `Remote.patch`.
   */
  ref: <E extends EntityLike>(entity: E, id: string): EntityRef<NameOf<E>, FieldsOf<E>> =>
    descriptorOf(entity).ref(id) as EntityRef<NameOf<E>, FieldsOf<E>>,

  /**
   * Declares a Remote domain and binds it to its place in the application Model
   * in one step; the result carries the application-facing operations. The
   * descriptor alone is `Remote.define`, the binding alone `Remote.at`.
   */
  make: <
    AppModel,
    Store extends RemoteModel,
    const Entities extends readonly EntityLike[],
    const Queries extends readonly QueryDescriptor<any, any, any>[] = readonly [],
    const Mutations extends readonly MutationDescriptor<any, any, any>[] = readonly [],
  >(config: {
    readonly model: ModelRef<AppModel, Store>
    readonly entities: Entities
    readonly queries?: Queries
    readonly mutations?: Mutations
    /**
     * Checks each prediction against the server's answer, and records a
     * `PredictionMismatch` in `diagnostics` for each part that disagrees:
     * `Value`, a field a pending write showed that the answer holds otherwise;
     * `Placement`, a list placed in an order the server's first page does not
     * keep (each placed list is fetched too, for its page, and reads as it
     * would without the check meanwhile; a pending edit is not checked, since
     * the server does not have it yet); `Gap`, a row whose answer left out fields
     * the client showed while it was pending and the store does not otherwise
     * hold, so they are read again and the row reads `Loading` meanwhile. It
     * changes nothing else. Each is reported at error level. Off unless given: no package reads a build
     * mode, so pass `import.meta.env?.DEV === true` here, which Vite's dev
     * server and Vitest set and a production build does not. The object
     * form names what the server is meant to answer otherwise, by mutation
     * and query, each with a reason, and records nothing for it.
     */
    readonly verifyPredictions?:
      | boolean
      | VerifyPredictions<MutationName<Mutations[number]>, QueryName<Queries[number]>>
      | undefined
    /**
     * How the client runs a body's primitive operators when it judges rows it
     * holds (`Operators`): the kernel's when not given. A body calling one this
     * table lacks is judged by the server instead, as any row the client cannot
     * judge is.
     */
    readonly operators?: MemoryOperators | undefined
    /**
     * Who reads, as a row (`Remote.ref(User, model.me)`), or none for a
     * visitor: whom a declared write predicts each `Derived.exists` for. The
     * store holds one viewer's values, as it holds one principal's: a change
     * of viewer is a change of principal, which `Data.forget`s. Without it, an
     * exists is predicted only where a write takes it away.
     */
    readonly viewer?:
      | ((model: AppModel) => Option.Option<{ readonly entity: string; readonly id: string }>)
      | undefined
    /**
     * How many entries, rows and lists, retention keeps (`defaultBudget`,
     * 1,000, when not given). What the active Surfaces read is always kept;
     * past the budget the Surfaces left longest ago are evicted, and going
     * back to one reads `Loading`, which `Data.why` says is `Evicted`.
     */
    readonly budget?: number | undefined
  }): RemoteDomain<AppModel, Store, Entities, Queries, Mutations> =>
    bindDomain(defineRemote(config), config.model, {
      verifyPredictions: config.verifyPredictions,
      operators: config.operators,
      viewer: config.viewer,
      budget: config.budget,
    }),

  /**
   * Declares a Remote domain without binding it: its entities, queries, and
   * mutations, plus the submodel. For a domain reused across applications or
   * bound in a test; `Remote.make` is the one-step form.
   */
  define: defineRemote,

  /**
   * Binds a Remote domain to its store's location in the application Model. The
   * registered entity names are carried on the returned value, so `Remote.select`
   * rejects a selection for an entity this domain never declared. `operators`
   * is the client's table, which a pending computed assignment is predicted by
   * (`Operators.kernel` when not given), as `Remote.make`'s is.
   */
  at: <
    AppModel,
    Store extends RemoteModel,
    Entities extends readonly EntityLike[],
    Queries extends readonly QueryDescriptor<any, any, any>[],
    Mutations extends readonly MutationDescriptor<any, any, any>[],
  >(
    definition: RemoteDescriptor<Entities, Queries, Mutations>,
    store: ModelRef<AppModel, Store>,
    options: { readonly operators?: MemoryOperators | undefined } = {},
  ): BoundRemote<AppModel, Store, EntityName<Entities[number]>> =>
    bindRemote(definition, store, options.operators ?? Operators.kernel),

  /**
   * The resume part for this domain, for `foldkit-ssr`'s `SSR.plan({ parts })`:
   * a server render sends what the plan's active Surfaces read from the store,
   * each connection with its boundaries and each live cursor with it, and
   * nothing else. `id` tells two domains in one application apart.
   */
  resume: resumePart,

  /**
   * A Projection node that reads a `RemoteData` value out of the store. The id
   * is supplied by the caller, usually from a Surface's params. The assembled
   * value is decoded against the Selection, so malformed server data surfaces
   * as `Failed` instead of being asserted into `Value`. A present value with a
   * stale field reads as `Refreshing`: an observer is refetching it.
   */
  select: <AppModel, Store extends RemoteModel, Names extends string, Value, Name extends string>(
    bound: BoundRemote<AppModel, Store, Names>,
    given: EntitySelection<Value, Name> & Registered<Name, Names, 'Entity'>,
  ) => {
    const selection = selectionOf<Value, Name>(given)
    assertRegistered(bound, 'Entity', bound.definition.registry.entities, selection.entity)
    const relation = relationOf(selection)
    const relationKey = stableStringify(relation)
    return (id: string): Projection<AppModel, RemoteData<Value>> => ({
      Model: remoteDataSchema(selection.schema),
      dependencies: [],
      metadata: RemoteRequirements.of({ ...relation, id }),
      read: (root: AppModel): RemoteData<Value> => {
        const store = storeOf(bound, root)
        const key = entityKey(selection.entity, id)
        // The store-dependent half is memoized per store snapshot; `undefined`
        // means the store lacks the value. Whether that reads as `Loading` or
        // `Initial` depends on the in-flight marks, which change independently
        // of the store, so it is decided outside the memo.
        const present = memoRead<RemoteData<Value> | undefined>(
          [store],
          `${key}\u0000${relationKey}`,
          () => {
            if (isTombstone(store, key)) return { _tag: 'NotFound' }
            const assembled = assemble(store, key, relation)
            if (assembled === undefined) return unavailableFailure(store, key, relation)
            const decoded = decodeRow(selection.schema, store[key]!.values, assembled.values)
            return Result.isFailure(decoded)
              ? { _tag: 'Failed', error: { _tag: 'DecodeError', message: decoded.failure.message } }
              : assembled.refreshing
                ? { _tag: 'Refreshing', value: decoded.success }
                : { _tag: 'Ready', value: decoded.success }
          },
        )
        // Decided outside the memo, as loading is: a failure can arrive
        // without the store changing.
        const remote = bound.store.get(root)
        const failure = failureOf(remote, selection.entity, id, relation)
        if (present !== undefined) {
          // A value on screen whose refresh failed stays on screen, with the
          // error, which `RemoteData.render` draws as stale.
          return failure !== undefined &&
            (present._tag === 'Ready' || present._tag === 'Refreshing')
            ? { _tag: 'Failed', error: failure, previous: present.value }
            : present
        }
        if (isLoadingThrough(remote, selection.entity, id, relation)) return { _tag: 'Loading' }
        if (failure !== undefined) return { _tag: 'Failed', error: failure }
        // A preview of something the server has not seen: what the overlay
        // leaves out will never arrive, so waiting would be `Initial` for good.
        if (onlyOverlaid(remote, selection.entity, id)) {
          const lacking = missingFields(store, key, relation.fields)
          return {
            _tag: 'Failed',
            error: {
              _tag: 'Overlaid',
              message: `${selection.entity} ${id} is shown only by an overlay, which does not hold ${
                lacking.length === 0 ? 'what its relations select' : lacking.join(', ')
              }; the server has not seen it, so nothing will fetch them.`,
            },
          }
        }
        // Nothing is fetching this: no active Surface observes it, which is
        // usually a wiring mistake.
        return { _tag: 'Initial' }
      },
    })
  },

  /**
   * When what a projection shows was last received, and whether it is stale
   * or loading. Pure, so a view can show "updated 5s ago" without I/O.
   *
   * `updatedAt` is the newest server write among what is shown, as the
   * store dates it; `undefined` when nothing shown was received (nothing
   * loaded, or only an optimistic preview). `stale` is any shown field or
   * connection marked stale; `loading` is any of them in flight. Optimistic
   * previews do not date: showing only one reads `updatedAt: undefined`.
   */
  meta: <AppModel, Store extends RemoteModel, Value>(
    bound: BoundRemote<AppModel, Store>,
    model: AppModel,
    projection: Projection<AppModel, Value>,
  ): ReadMeta => metaOf(bound.store.get(model), askedOf(projection), bound.operators),

  /**
   * The pure plan for a projection against a Model: the requirements its
   * remote store does not satisfy, under `options` (freshness, force). A
   * Surface's projection is `surface.projection(params)`.
   */
  plan: <AppModel, Store extends RemoteModel, Value>(
    bound: BoundRemote<AppModel, Store>,
    model: AppModel,
    projection: Projection<AppModel, Value>,
    options?: PlanOptions,
  ): ReadonlyArray<Requirement> =>
    planAsked(bound.store.get(model), askedOf(projection), options ?? {}, bound.operators)
      .requirements,

  /**
   * The queries a projection needs run before its connections read: those the
   * Model does not hold, or holds stale (every one under `force`).
   */
  planQueries: <AppModel, Store extends RemoteModel, Value>(
    bound: BoundRemote<AppModel, Store>,
    model: AppModel,
    projection: Projection<AppModel, Value>,
    options?: PlanOptions,
  ): ReadonlyArray<QueryRef<string, unknown>> =>
    planAsked(
      bound.store.get(model),
      askedOf(projection),
      options ?? {},
      bound.operators,
    ).queries.flatMap(query => (query.ref === undefined ? [] : [query.ref])),

  /**
   * The store reads see: the base store under the pending optimistic layers.
   * One store is shared by every read and plan of a Model whose remote state
   * has not changed.
   */
  storeOf: <AppModel, Store extends RemoteModel>(
    bound: BoundRemote<AppModel, Store>,
    model: AppModel,
  ): EntityStore => storeOf(bound, model),

  /**
   * The projection read against the server-derived store alone: the same
   * requirements, planned the same way, with the pending optimistic layers and
   * connection overlays left off. See the bound `Remote.confirmed`.
   */
  confirmed: <AppModel, Store extends RemoteModel, P extends Projection<AppModel, any>>(
    bound: BoundRemote<AppModel, Store>,
    projection: P,
  ): P => confirmed(bound, projection),

  /**
   * Executes the plan against the `RemoteClient` and returns a new store. Used
   * for SSR route prefetch, hover prefetch, and tests. Never called during render.
   * `policy` decides what a present field means (default cache-first); `now`
   * is the clock it reads, so the planner itself stays pure and time-injected.
   */
  prefetch: Effect.fn('Remote.prefetch')(function* <AppModel, Store extends RemoteModel, Value>(
    bound: BoundRemote<AppModel, Store>,
    model: AppModel,
    projection: Projection<AppModel, Value>,
    options: ObserveOptions = {},
  ) {
    const store = storeOf(bound, model)
    const { policy = RemotePolicy.cacheFirst, now = wallClock } = options
    const at = now()
    const missing = plan(store, requirementsOf(projection), RemotePolicy.toPlan(policy, at))
    if (missing.length === 0) return store
    yield* Effect.annotateCurrentSpan('requirementCount', missing.length)
    const client = yield* RemoteClient
    const result = yield* client.read({ version: REMOTE_PROTOCOL_VERSION, requests: missing })
    return writeRead(store, missing, result, at)
  }),

  /**
   * Marks what a read requires as due again: a projection, a Surface without
   * params, one entry of the active record, or the whole record, each entry
   * resolved for this Model as `subscriptions` resolves it. Called from
   * `update`: every selected field the store holds reads `Refreshing`, and
   * every loaded query connection is invalidated. Nothing is fetched here.
   * The read entries `Data.subscriptions` derives refetch it, because a stale
   * field or connection is planned again under every policy, so a refresh never
   * sends a request beside the entry already observing the same data.
   *
   * A refreshed connection's page replaces its pages, so items the server removed
   * or reordered follow it; pages loaded past the first are dropped and paged
   * again with `next`/`previous`. The read entries restart, so a read or query
   * sent before the refresh is not applied after it.
   *
   * It is also how a failed read is retried: nothing that failed is asked
   * again on its own, so its read stays `Failed` until this asks. A failed
   * read with nothing to show reads `Loading` from here, and `Failed` again if
   * the retry fails. `{ failed: true }` asks again only what failed, which is
   * what a "Try again" means: what loaded keeps its value and its pages.
   *
   * The projection must be observed, which it is while it is on screen. Live
   * subscriptions are left as they are. For data nothing observes (SSR, tests),
   * use `Remote.prefetch` with `RemotePolicy.networkOnly`. Refreshing what is
   * already being refreshed returns the same Model.
   */
  refresh: <AppModel, Store extends RemoteModel>(
    bound: BoundRemote<AppModel, Store>,
    model: AppModel,
    target: RefreshTarget<AppModel>,
    options: RefreshOptions = {},
  ): AppModel => {
    const remote = bound.store.get(model)
    if (isQueryRef(target)) {
      assertRegistered(bound, 'Query', bound.definition.registry.queries, target.query)
      // Only a list the Model holds, or whose query failed, has anything to ask again.
      const failed = Object.hasOwn(remote.failures.connections, target.identity)
      const due =
        failed || (options.failed !== true && remote.connections[target.identity] !== undefined)
      return due
        ? bound.store.set(model, invalidateConnections(remote, [target.identity]) as Store)
        : model
    }
    const asked = askedUnion(targetProjections(bound.contract, target, model))
    const merged = Requirement.mergeConnections(
      asked.connections,
    ) as ReadonlyArray<QueryRequirement>
    // A loaded connection's current items are marked with the entities; its page
    // is re-run by the read entry, and new items are planned when it lands.
    const items = merged.flatMap(connection => {
      const known = remote.connections[connection.identity]
      return known === undefined
        ? []
        : itemsOf(
            visibleItems(
              known,
              connection.identity,
              remote.optimistic.overlays,
              goneIn(remote.entities, remote.optimistic),
            ).map(edge => edge.ref),
            connection.select,
          )
    })
    const asking = [...asked.requirements, ...items]
    // `failed` asks again only what failed: each entity read whose own or
    // related fields failed, and each list whose query did. The rest, a
    // list's later pages included, stays as it is.
    const connections =
      options.failed === true
        ? merged.filter(connection => connection.identity in remote.failures.connections)
        : merged
    const requirements = plan(
      visibleStoreOf(remote.entities, remote.optimistic, bound.operators),
      options.failed === true
        ? asking.filter(
            requirement =>
              failureOf(remote, requirement.entity, requirement.id, requirement) !== undefined,
          )
        : asking,
      { force: true },
    )

    // A connection the Model never loaded is already a query to run: there is
    // nothing to invalidate and nothing to restart, so it takes no generation
    // either — unless its query failed, which is exactly what a refresh retries.
    const invalidated = connections
      .filter(
        connection =>
          remote.connections[connection.identity] !== undefined ||
          connection.identity in remote.failures.connections,
      )
      .map(connection => connection.identity)
    const marks: RemoteMessage[] = [
      ...(requirements.length === 0
        ? []
        : [{ _tag: 'RefreshStarted' as const, requests: requirements }]),
      ...invalidated.map(connection => ({
        _tag: 'ConnectionInvalidated' as const,
        connection,
      })),
    ]
    const marked = marks.reduce(updateRemote, remote)
    // Fields already stale may be in a read that began before this refresh (a
    // refreshing policy marks what it refetches); unless no read has begun since
    // the last refresh, that read is restarted too.
    const inFlight = requirements.some(requirement =>
      requirement.fields.some(
        field =>
          remote.entities[entityKey(requirement.entity, requirement.id)]?.stale.has(field) ===
            true && refreshIsInFlight(remote.refresh, requirement, field),
      ),
    )
    // Marking what is already marked changes nothing, so the Model keeps its identity.
    if (marked === remote && !inFlight) return model
    const refresh = withRefreshRequested(marked.refresh, requirements, invalidated)
    return bound.store.set(model, { ...marked, refresh } as Store)
  },

  /**
   * Forgets everything the server told this Model: values, tombstones,
   * unavailable fields, connections, live cursors, failures. What is known is
   * known for a principal, and this is the one boundary for a login, a logout
   * or a switch of organization: called from `update`, it performs no I/O, and
   * every active Surface's read and live entries restart, so the screen asks
   * again as whoever the client now is. A read or stream begun before is
   * interrupted rather than landing after. A mutation in flight is treated as
   * applied: its answer writes nothing here.
   */
  forget: <AppModel, Store extends RemoteModel>(
    bound: BoundRemote<AppModel, Store>,
    model: AppModel,
  ): AppModel => bound.store.set(model, forgetRemote(bound.store.get(model)) as Store),

  /**
   * Writes a read result into the store, recording each field's applied window.
   * `requests` are the planned requirements the result answers.
   */
  writeRead,

  /**
   * Remote's client over any way of sending one JSON request and receiving its
   * answer, for `clientLayer`: a worker, a server in the page. `RemoteServer.answer`
   * is the other end.
   */
  json: jsonClient,

  /**
   * Remote's client over HTTP, for `clientLayer`: each call a `POST` of the JSON
   * request to `url`. `headers` is read per request (a session token, say).
   */
  http: httpClient,

  /**
   * Remote's client over HTTP with live, for `clientLayer`: reads, queries,
   * and mutations as `http` sends them, live requirements as one `POST`
   * answered with a `text/event-stream` of changes.
   * `foldkit-remote-server/fetch` is the other end.
   */
  httpWithLive: httpWithLiveClient,

  /**
   * Effect RPC's client protocol over HTTP to `url`, for `RpcClient.make(RemoteRpc)`
   * under `clientLayer`: `RpcClient.layerProtocolHttp({ url })`, except that a
   * response under a status other than 2xx fails the call with its status, so
   * a request the server refused (middleware's 401 or 403, `bodyLimit`'s 413)
   * is not read as unreachable and resent for good.
   */
  rpcProtocolHttp,

  /**
   * Adapts an Effect RPC client for `RemoteRpc` to `RemoteClient`, so an
   * application provides the transport's RPC layer instead of writing the
   * `LiveChange`-to-`LiveEvent` mapping by hand. The client `RpcClient.make`
   * builds is accepted as it is: when its transport fails (`RpcClientError`),
   * a read, a query or a mutation fails `RemoteUnreachable` and a live stream
   * `RemoteLiveError`, which the application shows and retries like any
   * failure; a durable mutation is sent again. A failure carrying an HTTP
   * status (`rpcProtocolHttp` keeps it) reads as `Remote.http` reads it: a
   * 401 `RemoteUnauthenticated`, a 403 a mutation's `RemoteForbidden` and a
   * read's or a query's own error, a 413 the call's own error. A durable
   * mutation so refused is settled.
   */
  clientLayer: <R = never>(
    client: RemoteRpcClient<R, RpcClientError.RpcClientError | RemoteUnreachable>,
    options: ClientOptions = {},
  ): Layer.Layer<RemoteClient, never, R> =>
    coalescedLayer(
      Layer.effect(
        RemoteClient,
        Effect.gen(function* () {
          // What the RPC client needs (a database under in-process handlers,
          // nothing under a transport) is supplied once, when the layer is built.
          const context = yield* Effect.context<R>()
          return {
            read: batch =>
              client.FoldkitRemoteRead(batch).pipe(
                Effect.catchTag(
                  'RpcClientError',
                  rpcFailure((_status, message) => new RemoteReadError({ message })),
                ),
                Effect.provideContext(context),
              ),
            query: request =>
              client.FoldkitRemoteQuery(request).pipe(
                Effect.catchTag(
                  'RpcClientError',
                  rpcFailure((_status, message) => new RemoteQueryError({ message })),
                ),
                Effect.provideContext(context),
              ),
            mutate: request =>
              client.FoldkitRemoteMutate(request).pipe(
                Effect.catchTag(
                  'RpcClientError',
                  rpcFailure((status, message) =>
                    status === 403
                      ? new RemoteForbidden({ message })
                      : new RemoteMutationError({ message }),
                  ),
                ),
                Effect.provideContext(context),
              ),
            live: ({ requirements, queries, after }) =>
              client
                .FoldkitRemoteLive({
                  version: REMOTE_PROTOCOL_VERSION,
                  requirements,
                  ...(queries.length === 0 ? {} : { queries }),
                  after,
                })
                .pipe(
                  Stream.catchTag(['RpcClientError', 'Unreachable'], error =>
                    Stream.fail(new RemoteLiveError({ message: error.message })),
                  ),
                  Stream.map(liveEventOf),
                  Stream.provideContext(context),
                ),
          }
        }),
      ),
      options,
    ),

  /**
   * Wraps a `RemoteClient` layer so its reads coalesce: requirements issued
   * together become one batch, cut to the server's limits, a requirement
   * already in flight is joined, and one nobody waits on is interrupted;
   * every call is held to `timeout`. `Remote.clientLayer` applies this; use
   * it on a hand-written client.
   */
  coalesced: coalescedLayer,

  /**
   * A Foldkit Subscription entry that keeps the cache to what the active
   * Surfaces reach. `projections` are the ones the application observes (the
   * same it passes to `Remote.observe`), `connections` the query connections
   * it shows; anything else is collected once the roots have been stable for
   * `grace`, so a route transition that comes straight back does not thrash.
   */
  retain: <AppModel, Message = RemoteMessage>(
    projections: ReadonlyArray<Projection<AppModel, unknown>>,
    toMessage: (message: RemoteMessage) => Message = identityMessage as never,
    options: RetainEntryOptions = {},
  ): EntryWithoutKeepAlive<AppModel, Message, RetentionRoots, never> => {
    const roots = rootsOf(projections, options)
    const budget = checkedBudget(options.budget)
    return {
      dependenciesSchema: retentionRootsSchema,
      modelToDependencies: () => roots,
      dependenciesToStream: current =>
        Stream.fromEffect(
          Effect.succeed(toMessage(retentionChanged(current, budget))).pipe(
            Effect.delay(options.grace ?? 0),
          ),
        ),
    }
  },

  /**
   * Runs a `Query` through `RemoteClient`, encoding its input from the ref.
   * Pair the result with `Remote.queryMessage` to merge the page into the Model.
   * With `select`, the server also returns the selected fields of the page's
   * items, so one response populates both the connection and the store.
   */
  query: Effect.fn('Remote.query')(function* <Name extends string, Input>(
    ref: QueryRef<Name, Input>,
    select?: RelationRequirement | undefined,
  ) {
    const client = yield* RemoteClient
    const input = yield* Schema.encodeUnknownEffect(ref.Input)(ref.input).pipe(
      Effect.catchTag('SchemaError', error =>
        Effect.fail(new RemoteQueryError({ message: error.message })),
      ),
    )
    return yield* client.query({
      query: ref.query,
      input,
      window: ref.window,
      ...(select === undefined ? {} : { select }),
    })
  }),

  /** The `RemoteMessage` that merges a query page into its connection. */
  queryMessage: <Name extends string, Input>(
    ref: QueryRef<Name, Input>,
    result: Schema.Schema.Type<typeof QueryResult>,
    select?: RelationRequirement | undefined,
    now?: number | undefined,
  ): RemoteMessage => pageMessage(ref.identity, result, false, ref.window, select, now),

  /** A pure, serializable view of the whole cache. */
  inspect: inspectRemote,

  /** A pure, serializable view of one entity, or `undefined` if unknown. */
  inspectEntity,

  /**
   * Runs a mutation through `RemoteClient`, decoding its typed Output and
   * returning the result's normalized patches so the caller can reconcile them
   * through `updateRemote`'s `MutationSucceeded` (or `Remote.mutateInto`).
   */
  mutate: mutateRemote,

  /**
   * Reads the clock where the reader acts, for `Data.mutate`'s `now`: a
   * Command that yields `toMessage(now)`, the time in milliseconds since the
   * epoch. It reads Effect's `Clock`, so a test pins it, and `Trace.run`
   * runs it at the trace's time. Chirp's compose box answers a submit with
   * `Remote.now(now => Message.ClockedPost({ post, now }))`, and
   * `ClockedPost` starts the write.
   */
  now: <M>(
    toMessage: (now: number) => M,
  ): { readonly name: 'Remote.now'; readonly effect: Effect.Effect<M> } => ({
    name: 'Remote.now',
    effect: Effect.map(Clock.currentTimeMillis, toMessage),
  }),

  /**
   * Runs a mutation and reconciles its patches into a `RemoteModel` in one step,
   * returning the new model alongside the typed Output. The model-level form of
   * `MutationStarted` → `RemoteClient.mutate` → `MutationSucceeded`; in an
   * application the three are `update` (with `optimistic`), a Command, and the
   * Message the Command returns, so the optimistic operations show meanwhile.
   */
  mutateInto: Effect.fn('Remote.mutateInto')(function* <
    Name extends string,
    Input,
    Output,
    AppModel,
    Store extends RemoteModel,
  >(
    bound: BoundRemote<AppModel, Store>,
    model: AppModel,
    mutation: MutationDescriptor<Name, Input, Output>,
    input: Input,
    requestId: string,
    options: MutateOptions = {},
  ) {
    const started = updateRemote(bound.store.get(model), {
      _tag: 'MutationStarted',
      requestId,
      ...(options.optimistic === undefined ? {} : { optimistic: options.optimistic }),
    })
    const outcome = yield* mutateRemote(mutation, input, requestId, { now: options.now })
    const settled = updateRemote(started, {
      _tag: 'MutationSucceeded',
      requestId,
      entities: outcome.entities,
      connections: outcome.connections,
      deleted: outcome.deleted,
      now: yield* Clock.currentTimeMillis,
    })
    return {
      output: outcome.output,
      model: bound.store.set(model, settled as Store),
    }
  }),

  /**
   * A Foldkit Subscription entry that plans a Surface's missing fields from the
   * Model and fetches them through `RemoteClient`, emitting a `RemoteMessage`
   * per outcome. Wrap it in an application Message (`toMessage`) and reduce it
   * with the domain's `update`. Under a refreshing `policy` the entry first
   * emits `RefreshStarted`, so the fields being refetched read as `Refreshing`
   * while the request is pending.
   */
  observe: <
    AppModel,
    Store extends RemoteModel,
    Names extends string,
    Model,
    SurfaceMessage,
    Params,
    Message = RemoteMessage,
  >(
    bound: BoundRemote<AppModel, Store, Names>,
    surface: Surface<AppModel, Model, SurfaceMessage, Params>,
    params: Params,
    toMessage: (message: RemoteMessage) => Message = identityMessage as never,
    options: ObserveOptions = {},
  ): EntryWithoutKeepAlive<AppModel, Message, ReadDependencies, RemoteClient> =>
    observeEntry(bound, () => askedOf(surface.projection(params)), toMessage, options),

  /**
   * A Foldkit Subscription entry that consumes the live stream for a Surface's
   * requirements, emitting a `LiveReceived` per event and a `ReadFailed`
   * carrying its `stream` when the stream breaks (including
   * `ResumeUnavailable`). That records a gap on the stream rather than a failed
   * read, since nothing was being read, and restarts the entry after a
   * backoff; the restart refetches what it covers. The resume cursor is read
   * from `RemoteModel.live`, so the application tracks no cursor of its own.
   */
  live: <
    AppModel,
    Store extends RemoteModel,
    Names extends string,
    Model,
    SurfaceMessage,
    Params,
    Message = RemoteMessage,
  >(
    bound: BoundRemote<AppModel, Store, Names>,
    surface: Surface<AppModel, Model, SurfaceMessage, Params>,
    params: Params,
    toMessage: (message: RemoteMessage) => Message = identityMessage as never,
    options: LiveOptions = {},
  ): EntryWithoutKeepAlive<AppModel, Message, LiveDependencies, RemoteClient> =>
    liveEntry(
      bound,
      () => {
        const projection = surface.projection(params)
        // Every row the Surface reads; a list only where it is read live.
        return { ...liveAskOf(askedOf(projection)), requirements: requirementsOf(projection) }
      },
      toMessage,
      options,
    ),
}

// A domain's Subscription entries are unbranded so an application can spread
// them into its own `Subscription.make`; wiring hands them over as a branded record.
/**
 * Each entry with its Messages as the parent's and its dependencies as they
 * were. The Model is the parent's already, and `Subscription.lift` would wrap
 * every entry's dependencies in `maybeDependencies` (since Foldkit 0.166).
 */
const messagesAs = <AppModel, ParentMessage>(
  entries: Subscription.Subscriptions<AppModel, RemoteMessage, RemoteClient>,
  toParentMessage: (message: RemoteMessage) => ParentMessage,
) =>
  Record.map(entries, entry => ({
    ...entry,
    dependenciesToStream: (dependencies: unknown, read: () => unknown) =>
      Stream.map(entry.dependenciesToStream(dependencies, read), toParentMessage),
  }))

type Answer = Extract<RemoteMessage, { readonly _tag: 'MutationSucceeded' }>

/**
 * An answer with what it read folded into its patches, one per row, so a list
 * is placed by every value the answer wrote, a derived field it read included.
 */
const withAnswerRead = (answer: Answer): Answer => {
  if (answer.read === undefined) return answer
  const rows = new Map<string, NormalizedPatch>()
  for (const patch of [...answer.entities, ...answer.read.result.entities]) {
    const key = entityKey(patch.entity, patch.id)
    const held = rows.get(key)
    rows.set(
      key,
      held === undefined ? patch : { ...held, values: { ...held.values, ...patch.values } },
    )
  }
  return { ...answer, entities: [...rows.values()] }
}

const brandEntries = <AppModel>(
  entries: Readonly<Record<string, RemoteEntry<AppModel, any>>>,
): Subscription.Subscriptions<AppModel, RemoteMessage, RemoteClient> =>
  Subscription.make<AppModel, RemoteMessage, RemoteClient>()(() => entries)

/** The bound domain: the descriptor, the binding, and the operations over them. */
const bindDomain = <
  AppModel,
  Store extends RemoteModel,
  Entities extends readonly EntityLike[],
  Queries extends readonly QueryDescriptor<any, any, any>[],
  Mutations extends readonly MutationDescriptor<any, any, any>[],
>(
  definition: RemoteDescriptor<Entities, Queries, Mutations>,
  ref: ModelRef<AppModel, Store>,
  options: {
    readonly verifyPredictions?: boolean | VerifyPredictions | undefined
    readonly operators?: MemoryOperators | undefined
    readonly viewer?:
      | ((model: AppModel) => Option.Option<{ readonly entity: string; readonly id: string }>)
      | undefined
    readonly budget?: number | undefined
  } = {},
): RemoteDomain<AppModel, Store, Entities, Queries, Mutations> => {
  const operators = options.operators ?? Operators.kernel
  const budget = checkedBudget(options.budget)
  const bound = bindRemote(definition, ref, operators)
  const verify = verification(options.verifyPredictions, {
    mutations: new Set(definition.registry.mutations.keys()),
    queries: new Set(definition.registry.queries.keys()),
  })
  const store = bound.store
  const viewerOf = options.viewer ?? (() => Option.none())
  // What a body's `Expr.viewer` reads here. The client has no reading of the
  // time a server judges a list at, so a body over `Expr.now` is the server's.
  const contextOf = (model: AppModel): ExprContext => ({
    viewer: viewerOf(model),
    now: Option.none(),
  })
  // Every reader any `subscriptions` call names, and every connection one keeps:
  // retention is the domain's, so each call's retain entry roots them all, and
  // one call with its own policy does not collect what another call reads.
  const readers = new Map<
    ActiveEntry<AppModel>,
    (model: AppModel) => ReadonlyArray<NamedProjection<AppModel>>
  >()
  const keptConnections = new Set<string>()
  // Whether every call naming a reader ages what it reads: a list only such
  // readers read keeps its age once left, rather than going stale.
  const ageing = new Map<ActiveEntry<AppModel>, boolean>()
  /**
   * What to do with a row a live event says was inserted into a connection.
   *
   * Resolved here rather than in the pure reducer because this is the only
   * place with both the Model and the registry, and two separate things needed
   * one or the other.
   *
   * **The declared policy reaches the decision.** `Query.connection(E, { live })`
   * has always been typed, documented, carried on the descriptor and encoded in
   * the Message schema — and nothing ever put it on a Message, so every live
   * insert took the default whatever an application asked for. It does now.
   *
   * **A row the client can judge does not need a policy.** The policy exists
   * because nothing could tell whether an inserted row belonged to the query.
   * Where the body says it does not, `ignore` is not a guess. Where the body
   * says it does, or the client cannot tell — a row it never fetched, or holds
   * without a field the body reads — the declared policy is the answer, exactly
   * as it was meant to be.
   *
   * Only membership is decided here. *Where* a row sorts needs text collation,
   * which is the backend's, so the position the event carries stands.
   */
  const livePolicyFor = (model: AppModel, event: LiveEvent): LivePolicy | undefined => {
    if (event._tag !== 'ConnectionInsert') return undefined
    // An identity is always `name`, the separator, and the encoded input — it
    // is minted in exactly one place — so the separator is always present.
    const identity = event.connection
    const descriptor = definition.registry.queries.get(
      identity.slice(0, identity.indexOf(IDENTITY_SEPARATOR)),
    )
    const declared = (descriptor?.Result as Partial<ConnectionSpec> | undefined)?.live
    if (descriptor?.body === undefined) return declared
    const encoded = JSON.parse(identity.slice(identity.indexOf(IDENTITY_SEPARATOR) + 1)) as Record<
      string,
      unknown
    >
    const decided = belongsEncoded(
      storeOf(bound, model),
      descriptor,
      encoded,
      entityKey(event.edge.ref.entity, event.edge.ref.id),
      operators,
      contextOf(model),
    )
    return decided === 'no' ? { prepend: 'ignore', append: 'ignore' } : declared
  }

  // An application-union case has the runtime shape of the `RemoteMessage` it names.
  const reduce = (model: AppModel, message: RemoteMessage | RemoteMessageInput): AppModel => {
    const live =
      message._tag === 'LiveReceived'
        ? (message as Extract<RemoteMessage, { _tag: 'LiveReceived' }>)
        : undefined
    // A caller that said what it wanted keeps it; `updateRemote` on its own is
    // unchanged, so the pure reducer stays testable without a registry.
    const resolved =
      live === undefined || live.policy !== undefined
        ? message
        : { ...live, policy: livePolicyFor(model, live.event) }
    const remote = store.get(model)
    const reduced = updateRemote(remote, resolved as RemoteMessage)
    const answer =
      message._tag === 'MutationSucceeded'
        ? (message as Extract<RemoteMessage, { _tag: 'MutationSucceeded' }>)
        : undefined
    // A repeated answer finds every value it carries already held, so it
    // changes nothing and invalidates nothing.
    const next =
      answer === undefined
        ? placedNews(reduced, newsOf(message), remote.entities, contextOf(model))
        : impactOf(
            reduced,
            remote.mutations.applied.has(answer.requestId) ? answer : withAnswerRead(answer),
            remote.entities,
            contextOf(model),
          )
    const checked =
      answer === undefined || !verify.on ? next : withAnswerChecked(model, remote, next, answer)
    return checked === remote ? model : store.set(model, checked as Store)
  }

  /**
   * `after` with each part of the request's prediction the answer disagreed
   * with (`verifyPredictions`): a field it showed that the answer holds
   * otherwise (`Value`), and a row it left without fields the client showed
   * (`Gap`).
   */
  const withAnswerChecked = (
    model: AppModel,
    before: RemoteModel,
    after: RemoteModel,
    answer: Extract<RemoteMessage, { _tag: 'MutationSucceeded' }>,
  ): RemoteModel => {
    const { requestId } = answer
    // A repeated answer writes nothing, so it leaves nothing out.
    if (before.mutations.applied.has(requestId)) return after
    const mutation = Option.map(
      Option.fromUndefinedOr(before.mutations.writes.get(requestId)),
      write => write.mutation,
    )
    const settled = store.set(model, after as Store)
    const projections = [...readers.values()].flatMap(resolvedAt =>
      resolvedAt(settled).map(({ projection }) => projection),
    )
    const found = [
      ...valueMismatches(requestId, mutation, before, after, answer),
      ...answerGaps(
        requestId,
        mutation,
        before.optimistic,
        after.optimistic,
        visibleStoreOf(after.entities, after.optimistic, operators),
        planAsked(unverified(after), askedUnion(projections), {}, operators).requirements,
      ),
    ].filter(found => !verify.expects(found.part._tag, mutation))
    return found.length === 0
      ? after
      : { ...after, diagnostics: withDiagnostics(after.diagnostics, found) }
  }

  /**
   * `remote` with each list placed only to be checked (`placed`) read as it
   * would be without the check: such a list is fetched for its page, and a
   * stale list plans no reads of its rows, so a gap in them would go unseen.
   */
  const unverified = (remote: RemoteModel): RemoteModel => {
    const checked = Object.keys(remote.placed).filter(
      identity => remote.connections[identity] !== undefined,
    )
    if (checked.length === 0) return remote
    const connections = { ...remote.connections }
    for (const identity of checked)
      connections[identity] = { ...connections[identity]!, stale: false }
    return { ...remote, connections }
  }

  /**
   * Each field the request's layer showed that its answer carries another
   * value of. A field the answer does not carry is the `Gap`'s; one a request
   * still pending also patches shows that request's value before and after,
   * so it is not judged.
   */
  const valueMismatches = (
    requestId: string,
    mutation: Option.Option<string>,
    before: RemoteModel,
    after: RemoteModel,
    answer: Extract<RemoteMessage, { _tag: 'MutationSucceeded' }>,
  ): ReadonlyArray<PredictionMismatch> => {
    const layer = before.optimistic.layers.find(each => each.id === requestId)
    if (layer === undefined) return []
    const shown = visibleStoreOf(before.entities, before.optimistic, operators)
    const answered = new Map<string, Readonly<Record<string, unknown>>>()
    for (const row of [...answer.entities, ...(answer.read?.result.entities ?? [])]) {
      const key = entityKey(row.entity, row.id)
      answered.set(key, { ...answered.get(key), ...row.values })
    }
    const stillPatched = new Set(
      after.optimistic.layers.flatMap(each =>
        each.patches.flatMap(patch =>
          patchedFields(patch).map(field => `${entityKey(patch.entity, patch.id)}.${field}`),
        ),
      ),
    )
    return layer.patches.flatMap(patch => {
      const key = entityKey(patch.entity, patch.id)
      const values = answered.get(key)
      const entry = shown[key]
      if (values === undefined || entry === undefined || entry.tombstone) return []
      return patchedFields(patch).flatMap(field =>
        stillPatched.has(`${key}.${field}`) ||
        !entry.present.has(field) ||
        !Object.hasOwn(values, field) ||
        sameData(entry.values[field], values[field])
          ? []
          : [
              predictionMismatch(
                PredictionPart.Value({
                  requestId,
                  mutation,
                  entity: patch.entity,
                  id: patch.id,
                  field,
                  shown: entry.values[field],
                  answered: values[field],
                }),
              ),
            ],
      )
    })
  }

  /** The registered query a connection identity names, and its encoded input. */
  const queryOf = (
    identity: string,
  ): Option.Option<Pick<HeldConnection, 'descriptor' | 'encoded' | 'filtered'>> => {
    const separator = identity.indexOf(IDENTITY_SEPARATOR)
    const descriptor = definition.registry.queries.get(identity.slice(0, separator))
    if (descriptor === undefined) return Option.none()
    const encoded = JSON.parse(identity.slice(separator + 1)) as Record<string, unknown>
    const over = descriptor.body?.entity.name
    const filtered = (over === undefined ? undefined : definition.registry.filtered.get(over)) ?? []
    return Option.some({ descriptor, encoded, filtered })
  }

  /**
   * `pages` with each change to a row they hold placed, judged against
   * `store`: a row that moved goes where the body's order puts it, and one
   * that stopped matching leaves. A row a pending write creates joins where
   * the body puts it, since the write holds all it is. Another row a change
   * brings in is not added, since what the list selects of it may not be
   * loaded, and a change the client cannot place leaves the row where it is.
   */
  const placedHeld = (
    identity: string,
    pages: Connection,
    changes: ReadonlyArray<EntityChange>,
    store: EntityStore,
    // For pending placement, the viewer its operations were predicted for; none
    // when no operation named one, and a body over the context is the server's.
    context?: ExprContext,
  ): Connection => {
    const query = queryOf(identity)
    if (Option.isNone(query)) return pages
    // Built once: each change is of a row of its own, judged against the store
    // as every change left it, so what the list held before them all is enough.
    const holds = new Set(items(pages).map(edge => entityKey(edge.ref.entity, edge.ref.id)))
    let placed = pages
    for (const change of changes) {
      const created = EntityChange.match(change, {
        Changed: ({ created }) => created,
        Deleted: () => false,
      })
      if (!holds.has(entityKey(change.entity, change.id)) && !created) continue
      placed = Impact.$match(
        impactOn({ ...query.value, connection: placed, holds }, store, change, operators, context),
        {
          Kept: () => placed,
          Placed: ({ connection }) => connection,
          Invalidated: () => placed,
        },
      )
    }
    return placed
  }

  /**
   * What a list body's context reads while pending layers are placed: the
   * viewer the newest operation was predicted for. The viewer is the
   * reader's, so every operation since the last `forget` names the same one.
   */
  const layersContext = (layers: ReadonlyArray<EntityLayer>): ExprContext | undefined => {
    const viewer = [...layers].reverse().find(layer => Option.isSome(layer.viewer))?.viewer
    return viewer === undefined ? undefined : { viewer, now: Option.none() }
  }

  /**
   * A loaded list with the pending layers placed in its pages, so a row a
   * pending edit moves, or takes out of the list, shows where its answer
   * will be placed until the edit settles.
   */
  const pendingPlaced = (remote: RemoteModel, identity: string, pages: Connection): Connection => {
    const { layers } = remote.optimistic
    if (layers.length === 0) return pages
    return memoRead([pages, layers, remote.entities], `placed:${identity}`, () =>
      placedHeld(
        identity,
        pages,
        changesOf(
          { entities: resolvedPatches(remote.entities, remote.optimistic, operators) },
          remote.entities,
        ),
        visibleStoreOf(remote.entities, remote.optimistic, operators),
        layersContext(layers),
      ),
    )
  }

  /**
   * The edges a loaded list shows: its pages with pending edits placed, and
   * each row an insert overlay shows (a pending create, a confirmed or a live
   * insert) where the body's order puts it, or left out when it sorts past
   * what is loaded. An overlay says a row is in the list; in a list the
   * client can place, the order says where. A row it cannot place stays at
   * the end its overlay names.
   */
  const shownEdges = (
    remote: RemoteModel,
    identity: string,
    connection: Connection,
  ): ReadonlyArray<Edge> => {
    const pages = pendingPlaced(remote, identity, connection)
    const inserts = remote.optimistic.overlays.some(
      overlay => overlay.connection === identity && overlay.position !== 'remove',
    )
    const shown = inserts
      ? insertsPlaced(remote, identity, pages)
      : { pages, overlays: remote.optimistic.overlays }
    return visibleItems(
      shown.pages,
      identity,
      shown.overlays,
      goneIn(remote.entities, remote.optimistic),
    )
  }

  const insertsPlaced = (
    remote: RemoteModel,
    identity: string,
    pages: Connection,
  ): { readonly pages: Connection; readonly overlays: ReadonlyArray<ConnectionOverlay> } => {
    const { overlays } = remote.optimistic
    const store = visibleStoreOf(remote.entities, remote.optimistic, operators)
    return memoRead([pages, overlays, store], `inserted:${identity}`, () => {
      const query = queryOf(identity)
      const body = Option.isSome(query) ? query.value.descriptor.body : undefined
      if (Option.isNone(query) || body === undefined) return { pages, overlays }
      // A row a later remove hides is placed too: `visibleItems` hides it
      // wherever it is.
      const inserted = new Map<string, Edge>()
      for (const overlay of overlays) {
        if (overlay.connection !== identity || overlay.position === 'remove') continue
        for (const edge of overlay.edges) inserted.set(edge.key, edge)
      }
      const held = new Set(items(pages).map(edge => edge.key))
      let placed = pages
      const outside: Array<Edge> = []
      for (const edge of inserted.values()) {
        if (held.has(edge.key)) continue
        const key = entityKey(edge.ref.entity, edge.ref.id)
        RowPlace.$match(placeIn(store, placed, body, query.value.encoded, key, operators), {
          Before: place => void (placed = withEdge(placed, edge, place)),
          End: place => void (placed = withEdge(placed, edge, place)),
          Outside: () => void outside.push(edge),
          Unknown: () => undefined,
        })
      }
      return {
        pages: placed,
        overlays:
          outside.length === 0
            ? overlays
            : [
                ...overlays,
                { id: 'placed:outside', connection: identity, edges: outside, position: 'remove' },
              ],
      }
    })
  }

  /**
   * The loaded lists with what the server said of rows they hold placed: a
   * read or a live patch that changes a held row's ordering or filtered field
   * moves it, or takes it out, as a mutation's answer does. A list it cannot
   * place stands as it is, as a read is no write: its own refetch or live
   * stream says otherwise. Only a value the client held before counts, so a
   * row's first read judges nothing.
   */
  const placedNews = (
    remote: RemoteModel,
    news: ReadonlyArray<NormalizedPatch>,
    before: EntityStore,
    context: ExprContext,
  ): RemoteModel => {
    if (news.length === 0) return remote
    const held = news.map(patch => {
      const values = before[entityKey(patch.entity, patch.id)]?.values ?? {}
      return {
        ...patch,
        values: Object.fromEntries(
          Object.entries(patch.values).filter(([field]) => Object.hasOwn(values, field)),
        ),
      }
    })
    const changes = changesOf({ entities: held }, before)
    if (changes.length === 0) return remote
    const placed: Record<string, Connection> = {}
    for (const [identity, pages] of Object.entries(remote.connections)) {
      const after = placedHeld(identity, pages, changes, remote.entities, context)
      if (after !== pages) placed[identity] = after
    }
    return withPlacements(remote, placed, [])
  }

  /** The rows a read or a live patch says the server holds now. */
  const newsOf = (message: RemoteMessage | RemoteMessageInput): ReadonlyArray<NormalizedPatch> => {
    if (message._tag === 'ReadReceived') return message.result.entities
    if (message._tag !== 'LiveReceived') return []
    const event = message.event as LiveEvent
    if (event._tag !== 'EntityPatched') return []
    return [{ entity: event.ref.entity, id: event.ref.id, values: event.values }]
  }

  /**
   * The loaded connections as a write left them: each judged by its body
   * against the store as the write left it, a change it can place placed in
   * its pages, and one it cannot invalidated for its read entry to fetch.
   */
  const impactOf = (
    remote: RemoteModel,
    answer: Extract<RemoteMessage, { readonly _tag: 'MutationSucceeded' }>,
    // The store before the answer, to tell a value it changed from one it repeated.
    before: EntityStore,
    context: ExprContext,
  ): RemoteModel => {
    const changes = changesOf(answer, before)
    if (changes.length === 0) return remote
    // A row the answer itself put in or took out of a list is where the server
    // says; every other change to that list's rows is judged as anywhere.
    const named = new Map<string, Set<string>>()
    for (const change of answer.connections ?? []) {
      const keys = named.get(change.connection) ?? new Set<string>()
      keys.add(change.edge.key)
      named.set(change.connection, keys)
    }
    const visible = visibleStoreOf(remote.entities, remote.optimistic, operators)
    const placed: Record<string, Connection> = {}
    const invalidated: Array<string> = []
    for (const identity of Object.keys(remote.connections)) {
      const answered = named.get(identity)
      const judged =
        answered === undefined
          ? changes
          : changes.filter(change => !answered.has(entityKey(change.entity, change.id)))
      if (judged.length === 0) continue
      const query = queryOf(identity)
      if (Option.isNone(query)) continue
      const original = remote.connections[identity]!
      // Each change is judged against the pages the one before it left. What the
      // list holds is read once: a change is of a row of its own, judged against
      // the store as the whole answer left it.
      const holds = new Set(
        visibleItems(
          original,
          identity,
          remote.optimistic.overlays,
          goneIn(remote.entities, remote.optimistic),
        ).map(edge => entityKey(edge.ref.entity, edge.ref.id)),
      )
      let pages = original
      let invalid = false
      for (const change of judged) {
        const held: HeldConnection = { ...query.value, connection: pages, holds }
        const after = Impact.$match(impactOn(held, visible, change, operators, context), {
          Kept: () => Option.some(pages),
          Placed: ({ connection }) => Option.some(connection),
          Invalidated: () => Option.none<Connection>(),
        })
        if (Option.isNone(after)) {
          invalid = true
          break
        }
        pages = after.value
      }
      if (invalid) invalidated.push(identity)
      else if (pages !== original) placed[identity] = pages
    }
    return withPlacements(remote, placed, invalidated)
  }

  /**
   * The lists placed and invalidated. Under `verifyPredictions`, each placed
   * list is fetched too, and the order it was placed in kept to compare with
   * the server's page.
   */
  const withPlacements = (
    remote: RemoteModel,
    placed: Readonly<Record<string, Connection>>,
    invalidated: ReadonlyArray<string>,
  ): RemoteModel => {
    if (Object.keys(placed).length === 0) return invalidateConnections(remote, invalidated)
    const withPlaced = { ...remote, connections: { ...remote.connections, ...placed } }
    // A list whose order the server is meant to answer otherwise is not checked.
    const identities = Object.keys(placed).filter(
      identity =>
        verify.on &&
        !verify.expects(
          'Placement',
          Option.some(identity.slice(0, identity.indexOf(IDENTITY_SEPARATOR))),
        ),
    )
    if (identities.length === 0) return invalidateConnections(withPlaced, invalidated)
    const firstPage = (connection: Connection | undefined) =>
      (connection?.segments[0]?.edges ?? []).map(edge => edge.key)
    // Each checked list is made stale so its page is fetched; one stale for
    // that alone reads as fresh, as without the check (`readsStale`).
    const marked = invalidateConnections(withPlaced, [...invalidated, ...identities])
    const invalidatedAnyway = new Set(invalidated)
    const orders = Object.fromEntries(
      identities.map(identity => {
        const order = firstPage(placed[identity])
        const kept = new Set(order)
        return [
          identity,
          {
            order,
            dropped: firstPage(remote.connections[identity]).filter(key => !kept.has(key)),
            checking: !invalidatedAnyway.has(identity),
          },
        ]
      }),
    )
    return { ...marked, placed: { ...marked.placed, ...orders } }
  }
  const assertOwned = (entry: ActiveEntry<AppModel>) => assertOwnedBy(bound.contract, entry)
  /**
   * What the reader is shown of each entity in `model`, and what the write
   * itself shows (`predicted`) or foresees on its row (`write`), for its
   * answer to carry (#245, #265, #370).
   */
  const shownAt = (
    model: AppModel,
    predicted: ReadonlyArray<OptimisticOperation>,
    write: Domain.AnyWrite | undefined,
  ): ReadonlyArray<RelationRequirement> =>
    shownOf(
      askedUnion(
        [...readers.values()].flatMap(resolvedAt =>
          resolvedAt(model).map(({ projection }) => projection),
        ),
      ),
      predicted,
      write === undefined ? [] : foreseenOfWrite(write),
    )
  /**
   * A durable write's request id, which is its operation id: this page's
   * session and the next in its sequence, unique across tabs and loads. Only
   * a retry names one, and only one the outbox holds.
   */
  const durableId = (remote: RemoteModel, mutation: string, given: string | undefined): string => {
    if (given !== undefined) {
      if (remote.outbox.queue.some(queued => operationOf(queued) === given)) return given
      throw new Error(
        `[foldkit-remote] Data.mutate(${mutation}, { durable: true, requestId: "${given}" }): a durable write is named by the outbox; pass no requestId`,
      )
    }
    return Option.match(remote.outbox.session, {
      onNone: () => {
        throw new Error(
          `[foldkit-remote] Data.mutate(${mutation}, { durable: true }) before the outbox's restore has run: start init from Data.outbox(…).restore(model), as the runtime's flags, so a durable write has an id no other tab or page load uses`,
        )
      },
      onSome: session => `${session}-${remote.mutations.sequence + 1}`,
    })
  }
  /** The descriptor a recorded write names; only a hand-built `MutationStarted` names another. */
  const registeredMutation = (name: string): MutationDescriptor<any, any, any> => {
    const descriptor = definition.registry.mutations.get(name)
    if (descriptor === undefined) {
      throw new Error(
        `Remote: a failed write names mutation "${name}", which domain "${bound.contract.name}" does not register`,
      )
    }
    return descriptor
  }
  /**
   * `prefetch` and `satisfy`, each Message they reduce also kept in `heard`,
   * so `preload` can hand them to the Model as it is by the time they land.
   */
  const prefetchInto = (
    model: AppModel,
    projection: Projection<AppModel, unknown>,
    options: ObserveOptions,
    heard: Array<RemoteMessage>,
  ) => {
    const hear = (current: AppModel, message: RemoteMessage): AppModel => {
      heard.push(message)
      return reduce(current, message)
    }
    return Effect.gen(function* () {
      const { policy = RemotePolicy.cacheFirst, now = wallClock } = options
      const client = yield* RemoteClient
      const planOptions = RemotePolicy.toPlan(policy, now())
      let current = model
      // The pages first, so their items join the one entity read below. A
      // page with a payload already writes its items' selected fields, so
      // the read below is only for what the server left out.
      for (const query of planAsked(store.get(current), askedOf(projection), planOptions, operators)
        .queries) {
        const page = yield* queryRequestOf(query).pipe(
          Effect.flatMap(request => client.query(request)),
        )
        current = hear(
          current,
          pageMessage(query.identity, page, true, query.window, query.select, now()),
        )
      }
      const requirements = planAsked(
        store.get(current),
        askedOf(projection),
        planOptions,
        operators,
      ).requirements
      if (requirements.length === 0) return current
      const at = now()
      const result = yield* client.read({
        version: REMOTE_PROTOCOL_VERSION,
        requests: requirements,
      })
      return hear(current, { _tag: 'ReadReceived', requests: requirements, result, now: at })
    })
  }
  const satisfyInto = (
    model: AppModel,
    active: Readonly<Record<string, ActiveEntry<AppModel>>>,
    options: SatisfyOptions,
    heard: Array<RemoteMessage>,
  ) =>
    Effect.gen(function* () {
      const { passes = 8, now = wallClock } = options
      const entries = Object.values(active)
      entries.forEach(assertOwned)
      const planOptions = RemotePolicy.toPlan(RemotePolicy.cacheFirst, now())
      const plans = (
        current: AppModel,
        projections: ReadonlyArray<Projection<AppModel, unknown>>,
      ) => {
        const planned = planAsked(
          store.get(current),
          askedUnion(projections),
          planOptions,
          operators,
        )
        return planned.queries.length > 0 || planned.requirements.length > 0
      }
      let current = model
      for (let pass = 0; pass < passes; pass++) {
        if (
          !entries.some(entry =>
            plans(
              current,
              resolvedOf(entry, current).map(({ projection }) => projection),
            ),
          )
        )
          return current
        for (const entry of entries) {
          // Asked again over the Model the Surface before it left. A family
          // resolves its parent first: a pass fetches the parent, and the
          // instances the parent reveals are read in a later pass.
          for (const { projection } of resolvedOf(entry, current))
            current = yield* prefetchInto(current, projection, { now }, heard)
        }
      }
      const reading = entries.flatMap(entry =>
        resolvedOf(entry, current).filter(({ projection }) => plans(current, [projection])),
      )
      if (reading.length === 0) return current
      return yield* new RemoteUnsatisfied({
        surfaces: reading.map(({ name }) => name),
        passes,
      })
    })
  const domain: RemoteDomain<AppModel, Store, Entities, Queries, Mutations> = {
    ...definition,
    ...bound,
    get: (selection, id) => Remote.select(bound, selection)(id),
    live: (selection, id) => {
      const projection = Remote.select(bound, selection)(id)
      return {
        ...projection,
        metadata: RemoteRequirements.of(
          ...requirementsOf(projection).map(requirement => ({ ...requirement, live: true })),
        ),
      }
    },
    active: (name, projectionOf) => {
      const { owner } = bound.contract
      if (owner === undefined)
        throw new Error(
          `Remote: "${name}" reads domain "${bound.contract.name}", whose Model field is a raw optic that names no application; make the domain from an application's field (App.model.remote) to give it reads`,
        )
      return { name, owner, messages: [], projectionOf }
    },
    subscriptions: (active, options = {}) => {
      // Dependencies differ per entry, as in Foldkit's own `Subscriptions` record.
      const entries: Record<string, RemoteEntry<AppModel, any>> = {}
      // Checked before any reader joins the domain, so a refused call adds none.
      for (const entry of Object.values(active)) assertOwned(entry)
      for (const [key, entry] of Object.entries(active)) {
        const resolvedAt = readers.get(entry) ?? memoizedResolved(entry)
        readers.set(entry, resolvedAt)
        ageing.set(
          entry,
          (ageing.get(entry) ?? true) && options.policy?._tag === 'StaleWhileRevalidate',
        )
        const asked = (model: AppModel) =>
          askedUnion(resolvedAt(model).map(({ projection }) => projection))
        entries[`${key}.read`] = observeEntry(bound, asked, identityMessage, options)
        entries[`${key}.live`] = liveEntry(
          bound,
          model => liveAskOf(asked(model)),
          identityMessage,
          options,
        )
      }
      for (const identity of options.connections ?? [])
        keptConnections.add(connectionIdentity(identity))
      entries.retain = {
        dependenciesSchema: retentionRootsSchema,
        modelToDependencies: model => {
          const unaged = new Set<string>()
          const projections = [...readers].flatMap(([entry, resolvedAt]) => {
            const read = resolvedAt(model).map(({ projection }) => projection)
            if (ageing.get(entry) !== true)
              for (const { identity } of read.flatMap(connectionsOf)) unaged.add(identity)
            return read
          })
          const roots = rootsOf(projections, { connections: [...keptConnections] })
          return {
            ...roots,
            connections: roots.connections.map(root =>
              root.select === undefined || unaged.has(root.identity)
                ? root
                : { ...root, ages: true },
            ),
          }
        },
        dependenciesToStream: (current: RetentionRoots) =>
          Stream.fromEffect(
            Effect.succeed<RemoteMessage>(retentionChanged(current, budget)).pipe(
              Effect.delay(options.grace ?? 0),
            ),
          ),
      }
      markAll(entries)
      // The loop above wrote exactly the keys the mapped type names.
      return entries as SubscriptionEntries<AppModel, typeof active>
    },
    plan: (model, projection, options) => Remote.plan(bound, model, projection, options),
    meta: (model, projection) => Remote.meta(bound, model, projection),
    storeOf: model => storeOf(bound, model),
    confirmed: projection => confirmed(bound, projection),
    prefetch: (model, projection, options = {}) => prefetchInto(model, projection, options, []),
    satisfy: (model, active, options = {}) => satisfyInto(model, active, options, []),
    preload: (model, active, options = {}) => {
      // A Surface of another application is a mistake in `update`, refused there.
      Object.values(active).forEach(assertOwned)
      return {
        name: 'Remote.preload',
        args: { active: Object.keys(active).join(', ') },
        effect: Effect.suspend(() => {
          const heard: Array<RemoteMessage> = []
          // Speculative: however the read ends, defects included, what it
          // heard is all it hands on, and the destination reads the rest.
          return satisfyInto(model, active, options, heard).pipe(
            Effect.exit,
            Effect.map((): RemoteMessage => ({ _tag: 'Preloaded', messages: heard })),
          )
        }),
      }
    },
    query: <Q extends QueryDescriptor<any, any, any>, Value, Entity extends string>(
      query: Q,
      input: QueryInput<Q>,
      options: QueryOptions<Value, Entity, QueryEntity<Q>>,
    ): QueryProjection<AppModel, Value, Q['name'], QueryInput<Q>> => {
      assertRegistered(bound, 'Query', definition.registry.queries, query.name)
      const { select: given, live, ...window } = options
      const select = selectionOf<Value, Entity>(given)
      for (const [side, size] of [
        ['first', window.first],
        ['last', window.last],
      ] as const) {
        if (size !== undefined && !(Number.isInteger(size) && size >= 0)) {
          throw new Error(
            `Remote: query "${query.name}" asks for ${side}: ${String(size)}; a page size is a non-negative integer`,
          )
        }
      }
      if (live === true && window.first === undefined) {
        throw new Error(
          `Remote: query "${query.name}" is read live without first; a list watched live is read again every tick, so it needs a size`,
        )
      }
      const listed = (query.Result as Partial<ConnectionSpec>).entity
      if (listed === undefined) {
        throw new Error(
          `Remote: query "${query.name}" is not a connection over an entity, so it has no page to select`,
        )
      }
      if (select.entity !== listed) {
        throw new Error(
          `Remote: the selection is of "${select.entity}", but query "${query.name}" lists "${listed}"`,
        )
      }
      const contract = placeableReadContract(
        readContract(query.ref(input), select, window),
        query.body,
        operators,
      )
      const { ref, relation } = contract
      const requirement = live === true ? { ...contract.requirement, live } : contract.requirement
      const relationKey = stableStringify(relation)
      // A read shows at most its window, whatever else loaded the connection:
      // a picker's `first: 50` and a Block's `first: 3` of one query share it.
      const sizeOf = (remote: RemoteModel) => windowSize(remote, ref)
      const shown = (remote: RemoteModel, connection: Connection) =>
        cutToWindow(shownEdges(remote, ref.identity, connection), ref.window, sizeOf(remote))
      // The first failed field among the rows a list shows, if any. Decided
      // outside the memo, which is keyed on what the rows are read from: a
      // failure can arrive without any of it changing.
      const failedItem = (
        remote: RemoteModel,
        connection: Connection,
      ): { readonly _tag: 'Failed'; readonly error: RemoteError } | undefined => {
        if (Object.keys(remote.failures.fields).length === 0) return undefined
        for (const edge of shown(remote, connection).edges) {
          if (edge.ref.entity !== relation.entity) continue
          const error = failureOf(remote, edge.ref.entity, edge.ref.id, relation)
          if (error !== undefined) return { _tag: 'Failed', error }
        }
        return undefined
      }
      // A page carries refs; its rows' fields are read after it lands. While
      // that read is in flight the list is loading, not `Initial`.
      const loadingItem = (
        remote: RemoteModel,
        connection: Connection,
      ): { readonly _tag: 'Loading' } | undefined => {
        if (remote.loading.size === 0) return undefined
        for (const edge of shown(remote, connection).edges) {
          if (edge.ref.entity !== relation.entity) continue
          if (isLoadingThrough(remote, edge.ref.entity, edge.ref.id, relation)) {
            return { _tag: 'Loading' }
          }
        }
        return undefined
      }
      // The page as the rows held make it, before any failure is laid over it.
      // A row missing a field is left out until it arrives, and the page reads
      // `Refreshing` meanwhile: a list showing rows keeps showing them while a
      // joined or re-read row is fetched. `undefined` when no row can be shown
      // and no row the window would show was deleted: a list that lost its rows
      // to a delete is a known list without them, not one waiting for its first
      // rows (#263).
      const readPage = (
        remote: RemoteModel,
        connection: Connection,
      ): RemoteData<Page<Value>> | undefined => {
        const visible = visibleStoreOf(remote.entities, remote.optimistic, operators)
        return memoRead<RemoteData<Page<Value>> | undefined>(
          [visible, connection, remote.optimistic.overlays, remote.placed],
          `${ref.identity}\u0000${relationKey}\u0000${String(sizeOf(remote))}`,
          () => {
            const rows: Value[] = []
            let refreshing = readsStale(remote, ref.identity)
            let missing = false
            const { edges, cutBefore, cutAfter } = shown(remote, connection)
            for (const edge of edges) {
              const key = entityKey(edge.ref.entity, edge.ref.id)
              const assembled = assemble(visible, key, relation)
              if (assembled === undefined) {
                const unavailable = unavailableFailure(visible, key, relation)
                if (unavailable !== undefined) return unavailable
                missing = true
                continue
              }
              const decoded = decodeRow(select.schema, visible[key]!.values, assembled.values)
              if (Result.isFailure(decoded)) {
                return {
                  _tag: 'Failed',
                  error: { _tag: 'DecodeError', message: decoded.failure.message },
                }
              }
              refreshing ||= assembled.refreshing
              rows.push(decoded.success)
            }
            if (
              missing &&
              rows.length === 0 &&
              !deletedInWindow(
                items(connection),
                new Set(shownEdges(remote, ref.identity, connection).map(edge => edge.key)),
                ref.window,
                sizeOf(remote),
                goneIn(remote.entities, remote.optimistic),
              )
            ) {
              return undefined
            }
            const page = {
              items: rows,
              hasNext: cutAfter || hasNext(connection),
              hasPrevious: cutBefore || hasPrevious(connection),
            }
            return refreshing || missing
              ? { _tag: 'Refreshing', value: page }
              : { _tag: 'Ready', value: page }
          },
        )
      }
      return {
        Model: remoteDataSchema(pageSchema(select.schema)) as Schema.Codec<
          RemoteData<Page<Value>>,
          unknown
        >,
        dependencies: [],
        metadata: RemoteConnections.of(requirement),
        ref,
        selection: select as Selection<Value, string>,
        read: (root: AppModel): RemoteData<Page<Value>> => {
          const remote = store.get(root)
          const connection = remote.connections[ref.identity]
          const failure = remote.failures.connections[ref.identity]
          // Invalidating a connection the Model never loaded records it stale with no
          // segments: still nothing to show. (A loaded empty page is not stale.)
          if (connection === undefined || (connection.stale && connection.segments.length === 0)) {
            if (isQueryLoading(remote, ref.identity)) return { _tag: 'Loading' }
            return failure === undefined ? { _tag: 'Initial' } : { _tag: 'Failed', error: failure }
          }
          // A query that answered is not the whole of a list: its rows' fields
          // are read separately, and one of those failing is the list's failure.
          const read = readPage(remote, connection) ??
            failedItem(remote, connection) ??
            loadingItem(remote, connection) ?? { _tag: 'Initial' }
          if (failure === undefined) {
            if (read._tag !== 'Ready' && read._tag !== 'Refreshing') return read
            const item = failedItem(remote, connection)
            return item === undefined
              ? read
              : { _tag: 'Failed', error: item.error, previous: read.value }
          }
          // The rows held before the failure are still the best there is, so they
          // go with it as `previous`, which `RemoteData.render` shows as stale.
          switch (read._tag) {
            case 'Ready':
            case 'Refreshing':
              return { _tag: 'Failed', error: failure, previous: read.value }
            case 'Failed':
              return read
            case 'Initial':
            case 'Loading':
            case 'NotFound':
              return { _tag: 'Failed', error: failure }
          }
        },
      }
    },
    more: (model, projection) => {
      const remote = store.get(model)
      const { ref } = projection
      const size = windowSize(remote, ref)
      const page = ref.window.first ?? ref.window.last
      if (size === undefined || page === undefined || page === 0) return Option.none()
      const read = projection.read(model)
      const beyond =
        (read._tag === 'Ready' || read._tag === 'Refreshing') &&
        (ref.window.first === undefined ? read.value.hasPrevious : read.value.hasNext)
      return beyond
        ? Option.some(
            bound.store.set(
              model,
              updateRemote(remote, {
                _tag: 'WindowGrown',
                window: windowGrowthKey(ref.identity, stableStringify(ref.window)),
                size: size + page,
              }) as Store,
            ),
          )
        : Option.none()
    },
    explain: (model, projection, options) => {
      const { ref } = projection
      // Which active Surfaces read this connection, asked of the Model rather
      // than of the projection: a Surface's projection is rebuilt per Model, so
      // the only honest comparison is by connection identity. A family names
      // each reading instance (`Grid[all]`), not just the Surface.
      const reading = Object.values(options?.surfaces ?? {}).flatMap(source => {
        const matched = resolvedOf(source, model).filter(({ projection: shown }) =>
          connectionsOf(shown).some(connection => connection.identity === ref.identity),
        )
        // An inactive Surface reads nothing, which is not the same as reading
        // something else.
        if (matched.length === 0) return []
        return [{ source, names: matched.map(({ name }) => name) }]
      })
      // The body lives on the descriptor, and a projection keeps only its
      // `QueryRef` — so the explanation looks the definition back up by name.
      // Which it can, because `Data` is bound to the domain that registered it.
      const body = definition.registry.queries.get(ref.query)?.body
      const [connection] = RemoteConnections.get(projection.metadata)
      return {
        domain: bound.contract.name,
        query: ref.query,
        input: Schema.encodeSync(ref.Input)(ref.input),
        identity: ref.identity,
        window: ref.window,
        select: connection!.select,
        ...(body === undefined
          ? {}
          : {
              body: Relational.show(body),
              dependencies: explainedDependencies(Relational.dependencies(body)),
            }),
        state: projection.read(model)._tag,
        ...(options?.surfaces === undefined
          ? {}
          : {
              surfaces: reading.flatMap(read => read.names),
              activation: reading.flatMap(read => {
                const activation = 'activation' in read.source ? read.source.activation : undefined
                return activation === undefined
                  ? []
                  : [{ surface: read.source.name, ...activation }]
              }),
            }),
      }
    },
    why: (model, projection, options) => {
      const data = projection.read(model)
      const asked = askedOf(projection)
      const entries = options?.surfaces === undefined ? [] : Object.values(options.surfaces)
      // Each active entry whose reads ask for all of this one: one that reads
      // part of it cannot be why it is fetched.
      const reading = entries.flatMap(entry => {
        const names = resolvedOf(entry, model)
          .filter(({ projection: shown }) => covers(askedOf(shown), asked))
          .map(({ name }) => name)
        return names.length === 0 ? [] : [{ entry, names }]
      })
      const surfaces =
        options?.surfaces === undefined
          ? Option.none()
          : Option.some(reading.flatMap(read => read.names))
      const initial: ReadonlyArray<Why> =
        data._tag !== 'Initial'
          ? []
          : [
              Option.match(surfaces, {
                onNone: () => Why.NoActiveRecord(),
                onSome: names =>
                  names.length === 0 ? Why.NotObserved() : Why.NotFetching({ surfaces: names }),
              }),
            ]
      const remote = store.get(model)
      const live =
        asked.requirements.some(requirement => requirement.live === true) ||
        asked.connections.some(connection => connection.live === true)
      const streams: ReadonlyArray<Why> = live
        ? reading.flatMap(({ entry }): ReadonlyArray<Why> => {
            return Match.valueTags(domain.liveStatus(model, entry), {
              Idle: () => [],
              Live: () => [],
              Reconnecting: ({ attempt, error }) => [
                Why.LiveReconnecting({ surface: entry.name, attempt, error }),
              ],
              Refused: ({ error }) => [Why.LiveRefused({ surface: entry.name, error })],
            })
          })
        : []
      const reader: WhyReader = {
        remote,
        visible: visibleStoreOf(remote.entities, remote.optimistic, operators),
        listOf: identity => ({
          query: Option.match(queryOf(identity), {
            onNone: () => identity,
            onSome: query => query.descriptor.name,
          }),
          identity,
        }),
        bodyOf: identity =>
          Option.flatMap(queryOf(identity), query =>
            Option.map(Option.fromUndefinedOr(query.descriptor.body), body => ({
              body,
              encoded: query.encoded,
            })),
          ),
        edgesOf: ({ identity, window }) => {
          const connection = remote.connections[identity] ?? emptyConnection
          const placed = shownEdges(remote, identity, connection)
          return {
            shown: cutToWindow(placed, window, windowSize(remote, { identity, window })).edges,
            placed,
            pages: items(connection),
          }
        },
        operators,
        context: layersContext(remote.optimistic.layers),
      }
      return readWhy(
        data._tag,
        [...initial, ...failedReasons(data), ...reasonsOf(reader, asked), ...streams],
        surfaces,
      )
    },
    timeline: (start, history, reads, options) => {
      let before = start
      return history.flatMap((entry, index) => {
        const from = before
        before = entry.model
        return Object.entries(reads).flatMap(([read, projection]): ReadonlyArray<ReadStep<any>> => {
          const was = projection.read(from)
          const is = projection.read(entry.model)
          if (was._tag === is._tag) return []
          return [
            {
              read,
              index,
              message: entry.message,
              from: was._tag,
              to: is._tag,
              why: domain.why(entry.model, projection, options),
              regression: regressed(was, is),
            },
          ]
        })
      })
    },
    filtered: (model, over, by, input) => {
      assertRegistered(bound, 'Query', definition.registry.queries, by.name)
      // A filter over a different Entity can never match anything, and would
      // otherwise answer "I checked the whole list and found nothing" — a
      // confident wrong answer rather than a refusal.
      const filters = by.body?.entity.name
      if (filters !== undefined && filters !== over.selection.entity) {
        throw new Error(
          `Remote: query "${by.name}" is over "${filters}", but the list is of "${over.selection.entity}", so it cannot filter it`,
        )
      }
      const remote = store.get(model)
      const connection = remote.connections[over.ref.identity]
      const visible = visibleStoreOf(remote.entities, remote.optimistic, operators)
      const edges =
        connection === undefined ? [] : shownEdges(remote, over.ref.identity, connection)
      const among = edges.map(edge => entityKey(edge.ref.entity, edge.ref.id))
      let judged: Judged
      try {
        judged = matching(visible, by, input, { among, operators, context: contextOf(model) })
      } catch (error) {
        // An input the reference interpreter refuses (a search holding NUL) is
        // one the server refuses too: nothing here can be said about the list.
        // Thrown on, it would end the `update` that asked.
        if (error instanceof QueryEvaluateError) return { items: [], complete: false }
        throw error
      }
      const relation = relationOf(over.selection)

      const items: unknown[] = []
      let assembledAll = true
      for (const key of judged.matched) {
        const assembled = assemble(visible, key, relation)
        // A matching row whose selected fields are not all here cannot be shown.
        // It is not dropped from the truth, only from the list: `complete` says
        // the answer is about less than the whole.
        if (assembled === undefined) {
          assembledAll = false
          continue
        }
        const decoded = decodeRow(over.selection.schema, visible[key]!.values, assembled.values)
        if (Result.isFailure(decoded)) {
          assembledAll = false
          continue
        }
        items.push(decoded.success)
      }

      return {
        items: items as never,
        // Whole only if every edge was judged, every match could be shown, and
        // the list itself is all there. `hasNext`/`hasPrevious` read the outer
        // boundaries alone, so `isGapped` is the third question: a connection
        // paged from both ends is `Terminal` at both and still missing its
        // middle.
        complete:
          judged.skipped.length === 0 &&
          assembledAll &&
          connection !== undefined &&
          !isGapped(connection) &&
          !hasNext(connection) &&
          !hasPrevious(connection),
      }
    },
    refresh: (model, target, options) => Remote.refresh(bound, model, target, options),
    forget: model => Remote.forget(bound, model),
    overlay: (model, id, optimistic) => reduce(model, { _tag: 'OverlayShown', id, optimistic }),
    lift: (model, id) => reduce(model, { _tag: 'OverlayLifted', id }),
    overlays: model => overlaysOf(store.get(model)),
    visibleItems: (remote, connection) => {
      const identity = connectionIdentity(connection)
      return shownEdges(remote, identity, remote.connections[identity] ?? emptyConnection)
    },
    mutate: (model, mutation, input, options = {}) => {
      assertRegistered(bound, 'Mutation', definition.registry.mutations, mutation.name)
      const remote = store.get(model)
      const durable = options.durable === true
      if (durable && options.timeout !== undefined)
        throw new Error(
          `[foldkit-remote] Data.mutate(${mutation.name}, { durable: true, timeout }): the outbox sends a durable write under the client's timeout; pass none`,
        )
      const requestId = durable
        ? durableId(remote, mutation.name, options.requestId)
        : (options.requestId ?? `${bound.contract.name}-${remote.mutations.sequence + 1}`)
      const tempId = `${requestId}.tmp`
      // A retry of a failed request sends the operation id it was first sent with.
      const known = Option.fromUndefinedOr(remote.mutations.operations.get(requestId))
      // A declared write shows what it writes until the server answers; one given wins.
      const viewer = viewerOf(model)
      const visible = visibleStoreOf(remote.entities, remote.optimistic, bound.operators)
      const predicted =
        mutation.write === undefined
          ? undefined
          : predictionOfWrite(mutation.write, input, options.keys, {
              derived: definition.registry.derived,
              store: visible,
              viewer,
              now: Option.fromUndefinedOr(options.now),
            })
      // A write the client can tell the server refuses is refused here, as the
      // server would refuse it, and nothing is sent or shown: one its held `may`
      // forbids, then, as the server decides in that order, one whose row
      // breaks an invariant.
      const write = mutation.write
      const refused =
        write === undefined || options.optimistic !== undefined
          ? Option.none()
          : Option.orElse(
              Option.map(
                forbiddenByWrite(write, input, options.keys, visible),
                ({ reason }): RemoteError =>
                  remoteError(
                    new RemoteForbidden({
                      message: Option.getOrElse(reason, () => 'Forbidden'),
                      ...Option.match(reason, {
                        onNone: () => ({}),
                        onSome: said => ({ reason: said }),
                      }),
                    }),
                  ),
              ),
              () =>
                Option.map(
                  brokenByWrite(
                    write,
                    input,
                    options.keys,
                    { viewer, now: Option.fromUndefinedOr(options.now) },
                    visible,
                    bound.operators,
                  ),
                  (held): RemoteError =>
                    remoteError({
                      _tag: 'RemoteMutationError',
                      message: held.message,
                      refusal: Schema.encodeUnknownSync(mutation.Refusal)({
                        _tag: 'Invalid',
                        entity: Option.some(held.entity),
                        rule: Option.some(held.id),
                        message: held.message,
                        path: held.path,
                      }),
                    }),
                ),
            )
      const optimistic = Option.isSome(refused)
        ? undefined
        : typeof options.optimistic === 'function'
          ? options.optimistic({ requestId, tempId })
          : (options.optimistic ?? predicted)
      // A write refused where it is made is settled at once, durable or not.
      const queued = durable && Option.isNone(refused)
      const started = updateRemote(remote, {
        _tag: 'MutationStarted',
        requestId,
        ...(optimistic === undefined ? {} : { optimistic }),
        ...(Option.isSome(viewer) ? { viewer: viewer.value } : {}),
        write: {
          mutation: mutation.name,
          input,
          ...(options.keys === undefined ? {} : { keys: options.keys }),
          ...(options.now === undefined ? {} : { now: options.now }),
          ...(queued
            ? {
                // Encoded here, so an input its Mutation cannot encode throws at the call.
                durable: {
                  input: Schema.encodeUnknownSync(mutation.Input)(input),
                  shown: shownAt(model, optimistic ?? [], mutation.write),
                },
              }
            : {}),
        },
      })
      const startedModel = store.set(model, started as Store)
      return {
        model: startedModel,
        requestId,
        tempId,
        command: {
          name: `Remote.mutate(${mutation.name})`,
          args: { requestId },
          // Minted where the Command runs, so `update` stays pure; a retry finds it in the Model.
          effect: Effect.flatMap(
            Effect.sync(() => Option.getOrElse(known, mintOperation)),
            (operation): Effect.Effect<RemoteMessage, never, RemoteClient> =>
              queued
                ? // The outbox sends it, once its store holds it.
                  Effect.succeed({ _tag: 'MutationQueued', requestId })
                : Option.isSome(refused)
                  ? Effect.succeed({
                      _tag: 'MutationFailed',
                      requestId,
                      error: refused.value,
                      operation,
                    })
                  : mutateRemote(mutation, input, requestId, {
                      keys: options.keys,
                      operation,
                      shown: shownAt(startedModel, optimistic ?? [], mutation.write),
                      now: options.now,
                      timeout: options.timeout,
                    }).pipe(
                      Effect.matchEffect({
                        onFailure: error =>
                          Effect.succeed<RemoteMessage>({
                            _tag: 'MutationFailed',
                            requestId,
                            error: remoteError(error),
                            operation,
                          }),
                        // Dated when it lands, by the clock a test pins.
                        onSuccess: outcome =>
                          Effect.map(Clock.currentTimeMillis, (at): RemoteMessage => ({
                            _tag: 'MutationSucceeded',
                            requestId,
                            entities: outcome.entities,
                            connections: outcome.connections,
                            deleted: outcome.deleted,
                            ...(outcome.read === undefined ? {} : { read: outcome.read }),
                            now: at,
                          })),
                      }),
                    ),
          ),
        },
      }
    },
    mutation: (model, requestId) => mutationStatus(store.get(model).mutations, requestId),
    refusal: (model, requestId, mutation) => {
      const status = mutationStatus(store.get(model).mutations, requestId)
      return status._tag === 'Failed' ? refusalOf(status.error, mutation) : Option.none()
    },
    failedWrites: (model: AppModel, mutation?: MutationDescriptor<any, any, any, any>) => {
      if (mutation !== undefined)
        assertRegistered(bound, 'Mutation', definition.registry.mutations, mutation.name)
      const { mutations } = store.get(model)
      // A retry in flight is pending again, and not listed until it fails again.
      const listed = [...mutations.failed].flatMap(requestId => {
        const write = mutations.writes.get(requestId)
        const error = mutations.errors.get(requestId)
        if (write === undefined || error === undefined || mutations.pending.has(requestId))
          return []
        if (mutation !== undefined && write.mutation !== mutation.name) return []
        const descriptor = registeredMutation(write.mutation)
        return [
          {
            requestId,
            mutation: descriptor,
            input: write.input,
            error,
            refusal: refusalOf(error, descriptor),
          },
        ]
      })
      // `Data.mutate` recorded each input as its mutation's Input.
      return listed as never
    },
    retry: (model, requestId) => {
      const { mutations, outbox } = store.get(model)
      const write = mutations.writes.get(requestId)
      if (write === undefined || mutationStatus(mutations, requestId)._tag !== 'Failed')
        return Option.none()
      return Option.some(
        domain.mutate(model, registeredMutation(write.mutation), write.input, {
          requestId,
          optimistic: write.optimistic,
          keys: write.keys,
          // The same time, so the server stores what the retry shows again.
          now: Option.getOrUndefined(write.now),
          durable: outbox.queue.some(queued => operationOf(queued) === requestId),
        }),
      )
    },
    dismiss: (model, requestId) => {
      const remote = store.get(model)
      const dismissed = dismissQueued(remote, requestId)
      if (dismissed !== remote) return store.set(model, dismissed as Store)
      if (mutationStatus(remote.mutations, requestId)._tag !== 'Failed') return model
      return store.set(model, {
        ...remote,
        mutations: forgetFailure(remote.mutations, requestId),
      } as Store)
    },
    liveStatus: (model, active) => {
      assertOwned(active)
      const resolvedAt = readers.get(active) ?? memoizedResolved(active)
      const live = liveAskOf(askedUnion(resolvedAt(model).map(({ projection }) => projection)))
      if (live.requirements.length === 0 && live.queries.length === 0) return { _tag: 'Idle' }
      const remote = store.get(model)
      const stream = liveStreamKey(live)
      const health = remote.streams[stream]
      if (health === undefined) return { _tag: 'Live' }
      return Option.match(health.refused, {
        onSome: error => ({ _tag: 'Refused', error }),
        onNone: () =>
          remote.gaps.has(stream)
            ? { _tag: 'Reconnecting', attempt: health.failures, error: health.error }
            : { _tag: 'Live' },
      })
    },
    outboxStatus: model => outboxStatus(store.get(model).outbox),
    reduce,
    inspect: model => inspectRemote(store.get(model)),
    verifiesPredictions: verify.on,
    persistence: options => {
      const connections = (options.connections ?? []).map(connectionIdentity)
      const snapshotOf =
        options.snapshot ??
        ((remote: RemoteModel) => RemotePersistence.snapshotOf(remote, { connections }))
      const debounce = options.debounce ?? '250 millis'
      // The snapshot text is derived on every Model change; it changes only with
      // the store, the connections and the scope, so it is kept by them.
      let last: {
        readonly entities: EntityStore
        readonly connections: RemoteModel['connections']
        readonly scope: string
        readonly text: Option.Option<string>
      } = { entities: emptyStore, connections: {}, scope: '', text: Option.none() }
      const textOf = (remote: RemoteModel, scope: string): Option.Option<string> => {
        if (
          last.entities !== remote.entities ||
          last.connections !== remote.connections ||
          last.scope !== scope
        ) {
          last = {
            entities: remote.entities,
            connections: remote.connections,
            scope,
            text: Option.fromUndefinedOr(
              RemotePersistence.dehydrate(snapshotOf(remote), {
                scope,
                maxBytes: options.maxBytes,
              }),
            ),
          }
        }
        return last.text
      }
      // A store that cannot be read restores nothing, so nothing is saved
      // under this key: an unread snapshot is never written over.
      const hydratedFrom = (
        key: string,
        scope: string,
      ): Effect.Effect<Option.Option<RemoteMessage>, never, KeyValueStore.KeyValueStore> =>
        RemotePersistence.restore({ key, scope, maxBytes: options.maxBytes }).pipe(
          Effect.map((snapshot): RemoteMessage => ({
            _tag: 'Hydrated',
            entities: snapshot.entities,
            connections: snapshot.connections,
            merge: 'preserve-existing',
            from: key,
          })),
          Effect.option,
        )
      // Restores the key the Model is not yet restored from: at start, unless
      // `init` began from `restore`, and whenever the key changes.
      const restoreEntry: EntryWithoutKeepAlive<
        AppModel,
        RemoteMessage,
        { readonly key: string; readonly scope: string; readonly restored: boolean },
        KeyValueStore.KeyValueStore
      > = {
        dependenciesSchema: Schema.Struct({
          key: Schema.String,
          scope: Schema.String,
          restored: Schema.Boolean,
        }),
        modelToDependencies: model => {
          const key = options.key(model)
          return {
            key,
            scope: options.scope(model),
            restored: Option.contains(store.get(model).restoredFrom, key),
          }
        },
        dependenciesToStream: ({ key, scope, restored }) =>
          restored
            ? Stream.empty
            : Stream.fromEffect(hydratedFrom(key, scope)).pipe(
                Stream.flatMap(Option.match({ onNone: () => Stream.empty, onSome: Stream.make })),
              ),
      }
      const save: EntryWithoutKeepAlive<
        AppModel,
        RemoteMessage,
        { readonly key: string; readonly restored: boolean; readonly text: Option.Option<string> },
        KeyValueStore.KeyValueStore
      > = {
        dependenciesSchema: Schema.Struct({
          key: Schema.String,
          restored: Schema.Boolean,
          text: Schema.OptionFromNullOr(Schema.String),
        }),
        modelToDependencies: model => {
          const remote = store.get(model)
          const key = options.key(model)
          const restored = Option.contains(remote.restoredFrom, key)
          return {
            key,
            restored,
            text: restored ? textOf(remote, options.scope(model)) : Option.none(),
          }
        },
        // A changed cache restarts this stream, so the wait is the debounce.
        dependenciesToStream: ({ key, restored, text }) =>
          restored
            ? Stream.fromEffect(
                Effect.gen(function* () {
                  yield* Effect.sleep(debounce)
                  const kv = yield* KeyValueStore.KeyValueStore
                  // Too large to keep: no stale smaller snapshot may outlive it.
                  yield* Option.match(text, {
                    onNone: () => kv.remove(key),
                    onSome: written => kv.set(key, written),
                  })
                }).pipe(
                  // A full store keeps the snapshot it had; the next change tries again.
                  Effect.ignore,
                ),
              ).pipe(Stream.drain)
            : Stream.empty,
      }
      return {
        key: `persistence:${bound.contract.name}`,
        handles: [],
        subscriptions: Subscription.make<AppModel, RemoteMessage, KeyValueStore.KeyValueStore>()(
          () => ({ 'persistence.restore': restoreEntry, 'persistence.save': save }),
        ),
        restore: model =>
          Effect.map(
            hydratedFrom(options.key(model), options.scope(model)),
            Option.match({ onNone: () => model, onSome: message => reduce(model, message) }),
          ),
      }
    },
    outbox: options => {
      /** How this version reads a stored input of `mutation`; none for one it does not register. */
      const inputOf = (mutation: string) =>
        Option.map(
          Option.fromUndefinedOr(definition.registry.mutations.get(mutation)),
          descriptor => (input: unknown) =>
            Option.map(Schema.decodeUnknownOption(descriptor.Input)(input), decoded => ({
              decoded,
            })),
        )
      const readOf = (
        key: string,
        scope: string,
        stored: StoredOutbox,
        extra: { readonly session?: string; readonly unsaved?: string } = {},
      ): RemoteMessage => ({
        _tag: 'OutboxRead',
        key,
        scope,
        entries: readEntries(stored, inputOf),
        done: stored.done,
        ...extra,
      })
      /** Tells the other tabs on `key` the store changed, with the answer that changed it. */
      const announce = (key: string, outcome: Option.Option<RemoteMessage>) =>
        Effect.sync(() =>
          Option.map(channelFor(key), channel => {
            channel.postMessage({ outcome: Option.getOrUndefined(outcome) })
            channel.close()
          }),
        )
      /** The store with `change` merged in, under its lock, so two tabs never write it at once. */
      const writeStored = (key: string, scope: string, change: StoredOutbox) =>
        withLock(
          storeLock(key),
          Effect.gen(function* () {
            // Another scope's waiting writes are never written over: a key that
            // is not one per principal fails the save, and says why.
            if (yield* othersWaiting(key, scope)) {
              return yield* Effect.fail(
                new Error(
                  `the store under ${key} holds another scope's waiting writes; give each principal a key of its own`,
                ),
              )
            }
            const merged = mergeStored(yield* readStored(key, scope), change)
            const kv = yield* KeyValueStore.KeyValueStore
            yield* kv.set(key, storedText(merged, scope))
            return merged
          }),
        )
      /** What the store holds, as a page reads it; this page's own queue, and why, where it cannot be read. */
      const restored = (key: string, scope: string, session: Option.Option<string>) =>
        readStored(key, scope).pipe(
          Effect.map(stored =>
            readOf(
              key,
              scope,
              stored,
              Option.match(session, {
                onNone: () => ({}),
                onSome: minted => ({ session: minted }),
              }),
            ),
          ),
          Effect.catch(error =>
            Effect.succeed(
              readOf(
                key,
                scope,
                { entries: [], done: [] },
                {
                  ...Option.match(session, {
                    onNone: () => ({}),
                    onSome: minted => ({ session: minted }),
                  }),
                  unsaved: error.message,
                },
              ),
            ),
          ),
        )
      /** Whether the page's queue is the one stored under `key` for `scope`. */
      const holding = (outbox: RemoteModel['outbox'], key: string, scope: string) =>
        Option.contains(outbox.key, key) && Option.contains(outbox.scope, scope)
      const minted = (has: boolean) =>
        has
          ? Effect.succeed(Option.none<string>())
          : Effect.sync(() => Option.some(mintOperation()))

      // The queue's text changes only with the queue and the scope, so it is kept by them.
      let lastText: {
        readonly outbox: RemoteModel['outbox'] | undefined
        readonly scope: string
        readonly text: string
      } = { outbox: undefined, scope: '', text: '' }
      const textOf = (outbox: RemoteModel['outbox'], scope: string): string => {
        if (lastText.outbox !== outbox || lastText.scope !== scope) {
          lastText = { outbox, scope, text: storedText(storedOf(outbox), scope) }
        }
        return lastText.text
      }

      const restoreEntry: EntryWithoutKeepAlive<
        AppModel,
        RemoteMessage,
        {
          readonly key: string
          readonly scope: string
          readonly restored: boolean
          readonly session: boolean
        },
        KeyValueStore.KeyValueStore
      > = {
        dependenciesSchema: Schema.Struct({
          key: Schema.String,
          scope: Schema.String,
          restored: Schema.Boolean,
          session: Schema.Boolean,
        }),
        modelToDependencies: model => {
          const { outbox } = store.get(model)
          const key = options.key(model)
          const scope = options.scope(model)
          return {
            key,
            scope,
            restored: holding(outbox, key, scope),
            session: Option.isSome(outbox.session),
          }
        },
        dependenciesToStream: ({ key, scope, restored: done, session }) =>
          done
            ? Stream.empty
            : Stream.fromEffect(
                Effect.flatMap(minted(session), mint => restored(key, scope, mint)),
              ),
      }

      // Written whenever the queue changes, merged with what other tabs wrote,
      // and read back: what the store holds is what may be sent.
      const save: EntryWithoutKeepAlive<
        AppModel,
        RemoteMessage,
        { readonly key: string; readonly scope: string; readonly text: Option.Option<string> },
        KeyValueStore.KeyValueStore
      > = {
        dependenciesSchema: Schema.Struct({
          key: Schema.String,
          scope: Schema.String,
          text: Schema.OptionFromNullOr(Schema.String),
        }),
        modelToDependencies: model => {
          const { outbox } = store.get(model)
          const key = options.key(model)
          const scope = options.scope(model)
          return {
            key,
            scope,
            // Saved only under the key and scope it was read for: never over a queue not yet read.
            text: holding(outbox, key, scope) ? Option.some(textOf(outbox, scope)) : Option.none(),
          }
        },
        dependenciesToStream: ({ key, scope, text }) =>
          Option.match(text, {
            onNone: () => Stream.empty,
            onSome: written => {
              const mine = storedFromText(written)
              return Stream.fromEffect(
                writeStored(key, scope, mine).pipe(
                  Effect.tap(() => announce(key, Option.none())),
                  Effect.map(merged => readOf(key, scope, merged)),
                  // A store that cannot be written does not hold the writes back:
                  // they are sent, and a reload before the answer loses them.
                  Effect.catch(error =>
                    Effect.succeed(readOf(key, scope, mine, { unsaved: error.message })),
                  ),
                ),
              )
            },
          }),
      }

      /** Sends `write`, as the one tab on `key` that sends, until the server answers it. */
      const sent = (key: string, scope: string, write: StoredWrite) =>
        Stream.callback<RemoteMessage, never, KeyValueStore.KeyValueStore | RemoteClient>(queue => {
          const emit = (message: RemoteMessage) => Queue.offer(queue, message)
          /**
           * The outcome told this tab and the others first, so each settles
           * with the server's answer, then written to the store before the
           * lock goes, so the next sender reads it.
           */
          const settle = (message: RemoteMessage, change: StoredOutbox) =>
            emit(message).pipe(
              Effect.andThen(announce(key, Option.some(message))),
              Effect.andThen(writeStored(key, scope, change)),
              Effect.andThen(announce(key, Option.none())),
              // Unwritten, the store still says waiting: the next sender sends it
              // again, and the operation id has the server answer from its record.
              Effect.ignore,
            )
          const operation = write.operation
          return withLock(
            sendLock(key),
            Effect.gen(function* () {
              // Another tab may have settled it while this one waited for the lock.
              const there = yield* Effect.option(readStored(key, scope))
              if (Option.isSome(there) && settledIn(there.value, operation)) {
                yield* emit(readOf(key, scope, there.value))
                return
              }
              const mutation = registeredMutation(write.mutation)
              const input = Schema.decodeUnknownSync(mutation.Input)(write.input)
              for (let attempt = 1; ; attempt++) {
                const result = yield* Effect.result(
                  mutateRemote(mutation, input, operation, {
                    keys: write.keys,
                    operation,
                    shown: write.shown,
                    now: write.now,
                  }),
                )
                if (Result.isSuccess(result)) {
                  const outcome = result.success
                  const at = yield* Clock.currentTimeMillis
                  return yield* settle(
                    {
                      _tag: 'MutationSucceeded',
                      requestId: operation,
                      entities: outcome.entities,
                      connections: outcome.connections,
                      deleted: outcome.deleted,
                      ...(outcome.read === undefined ? {} : { read: outcome.read }),
                      now: at,
                    },
                    { entries: [], done: [operation] },
                  )
                }
                const error = remoteError(result.failure)
                // Nothing answered: kept waiting, and sent again after a wait.
                if (result.failure._tag === 'Unreachable') {
                  yield* emit({ _tag: 'OutboxDelayed', requestId: operation, attempt, error })
                  yield* Effect.race(
                    Effect.flatMap(backoff(attempt, options.retry), Effect.sleep),
                    onlineAgain,
                  )
                  continue
                }
                return yield* settle(
                  { _tag: 'MutationFailed', requestId: operation, error, operation },
                  {
                    entries: [
                      { ...write, revision: write.revision + 1, state: { _tag: 'Failed', error } },
                    ],
                    done: [],
                  },
                )
              }
            }),
          ).pipe(Effect.ensuring(Queue.end(queue)))
        })

      // The head's text changes only with the head, so a send is not restarted
      // by anything else the Model does while it waits for its answer.
      let lastHead: {
        readonly outbox: RemoteModel['outbox'] | undefined
        readonly head: Option.Option<string>
      } = { outbox: undefined, head: Option.none() }
      const headTextOf = (outbox: RemoteModel['outbox']): Option.Option<string> => {
        if (lastHead.outbox !== outbox) {
          lastHead = { outbox, head: Option.map(headOf(outbox), write => JSON.stringify(write)) }
        }
        return lastHead.head
      }
      const send: EntryWithoutKeepAlive<
        AppModel,
        RemoteMessage,
        { readonly key: string; readonly scope: string; readonly head: Option.Option<string> },
        KeyValueStore.KeyValueStore | RemoteClient
      > = {
        dependenciesSchema: Schema.Struct({
          key: Schema.String,
          scope: Schema.String,
          head: Schema.OptionFromNullOr(Schema.String),
        }),
        modelToDependencies: model => {
          const { outbox } = store.get(model)
          const key = options.key(model)
          const scope = options.scope(model)
          return {
            key,
            scope,
            // Another scope's queue is never sent: it was made as someone else.
            head: holding(outbox, key, scope) ? headTextOf(outbox) : Option.none(),
          }
        },
        dependenciesToStream: ({ key, scope, head }) =>
          Option.match(head, {
            onNone: () => Stream.empty,
            onSome: text =>
              sent(key, scope, Schema.decodeUnknownSync(StoredWrite)(JSON.parse(text))),
          }),
      }

      /** What another tab announced: the answer it heard first, then the store as it now is. */
      const heard = (key: string, scope: string, data: unknown) =>
        Effect.map(restored(key, scope, Option.none()), (read): ReadonlyArray<RemoteMessage> => [
          ...Option.toArray(outcomeOf(data)),
          read,
        ])
      const watch: EntryWithoutKeepAlive<
        AppModel,
        RemoteMessage,
        { readonly key: string; readonly scope: string; readonly restored: boolean },
        KeyValueStore.KeyValueStore
      > = {
        dependenciesSchema: Schema.Struct({
          key: Schema.String,
          scope: Schema.String,
          restored: Schema.Boolean,
        }),
        modelToDependencies: model => {
          const key = options.key(model)
          const scope = options.scope(model)
          return {
            key,
            scope,
            restored: holding(store.get(model).outbox, key, scope),
          }
        },
        dependenciesToStream: ({ key, scope, restored: read }) =>
          read
            ? Stream.callback<unknown>(queue =>
                Effect.acquireRelease(
                  Effect.sync(() =>
                    Option.map(channelFor(key), channel => {
                      channel.onmessage = (event: MessageEvent<unknown>) => {
                        Queue.offerUnsafe(queue, event.data)
                      }
                      return channel
                    }),
                  ),
                  channel => Effect.sync(() => Option.map(channel, open => open.close())),
                ),
              ).pipe(
                Stream.mapEffect(data => heard(key, scope, data)),
                Stream.flatMap(messages => Stream.fromIterable(messages)),
              )
            : Stream.empty,
      }

      return {
        key: `outbox:${bound.contract.name}`,
        handles: [],
        subscriptions: Subscription.make<
          AppModel,
          RemoteMessage,
          KeyValueStore.KeyValueStore | RemoteClient
        >()(() => ({
          'outbox.restore': restoreEntry,
          'outbox.save': save,
          'outbox.send': send,
          'outbox.watch': watch,
        })),
        restore: model =>
          Effect.map(
            Effect.flatMap(minted(Option.isSome(store.get(model).outbox.session)), mint =>
              restored(options.key(model), options.scope(model), mint),
            ),
            message => reduce(model, message),
          ),
      }
    },
    wiring: (active, options = {}) => ({
      key: `remote:${bound.contract.name}`,
      shared: options.shared ?? [],
      // Every domain claims the same tags with no per-domain discriminator, so
      // the assembly's claimant check keeps one assembly to one domain.
      handles: Record.keys(remoteMessageCases),
      route: (model, message) =>
        isRemoteMessage(message)
          ? Option.some(
              reduceReporting(
                bound.store,
                reduce,
                model,
                message,
                (options.shared ?? []).some(tag => tag === 'MutationFailed'),
              ),
            )
          : Option.none(),
      subscriptions: brandEntries(domain.subscriptions(active, options)),
      contract: bound.contract,
    }),
  }
  return domain
}

/** The outbox's own answers, as another tab announced them: a settled write, and nothing else. */
const announcedOutcome = Schema.Struct({ outcome: Schema.optional(remoteMessageSchema) })
const outcomeOf = (data: unknown): Option.Option<RemoteMessage> =>
  Option.filter(
    Option.flatMap(Schema.decodeUnknownOption(announcedOutcome)(data), ({ outcome }) =>
      Option.fromUndefinedOr(outcome),
    ),
    outcome => outcome._tag === 'MutationSucceeded' || outcome._tag === 'MutationFailed',
  )

/** The window keys of a `QueryOptions`, and only those, without the undefined ones. */
/**
 * How many rows a read of `ref` shows: its window's `first` or `last`, as
 * `Data.more` has grown it. `undefined` for a window with a cursor or no size,
 * which shows whatever the connection holds.
 */
const windowSize = (
  remote: RemoteModel,
  ref: { readonly identity: string; readonly window: QueryWindow },
): number | undefined => {
  const { first, last, after, before } = ref.window
  if (after !== undefined || before !== undefined) return undefined
  const size = first ?? last
  return size === undefined
    ? undefined
    : (remote.grown[windowGrowthKey(ref.identity, stableStringify(ref.window))] ?? size)
}

/** The edges a window of `size` shows, from the start (`first`) or the end (`last`), and which end it cut. */
const cutToWindow = (
  edges: ReadonlyArray<Edge>,
  window: QueryWindow,
  size: number | undefined,
): {
  readonly edges: ReadonlyArray<Edge>
  readonly cutBefore: boolean
  readonly cutAfter: boolean
} => {
  if (size === undefined || edges.length <= size) {
    return { edges, cutBefore: false, cutAfter: false }
  }
  return window.first === undefined
    ? { edges: edges.slice(edges.length - size), cutBefore: true, cutAfter: false }
    : { edges: edges.slice(0, size), cutBefore: false, cutAfter: true }
}

/**
 * Whether a row a window of `size` would show was deleted: one of `edges`
 * gone before the window, read from its end, fills with rows still `shown`.
 * A delete past the window is another window's (#287).
 */
const deletedInWindow = (
  edges: ReadonlyArray<Edge>,
  shown: ReadonlySet<string>,
  window: QueryWindow,
  size: number | undefined,
  gone: (key: string) => boolean,
): boolean => {
  const ordered = window.first === undefined ? [...edges].reverse() : edges
  let filled = 0
  for (const edge of ordered) {
    if (size !== undefined && filled >= size) return false
    if (gone(entityKey(edge.ref.entity, edge.ref.id))) return true
    if (shown.has(edge.key)) filled++
  }
  return false
}

const pickWindow = (window: QueryWindowOptions): QueryWindow => ({
  ...(window.first === undefined ? {} : { first: window.first }),
  ...(window.last === undefined ? {} : { last: window.last }),
  ...(window.after === undefined ? {} : { after: window.after }),
  ...(window.before === undefined ? {} : { before: window.before }),
})
