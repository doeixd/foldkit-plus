/**
 * `foldkit-remote` — normalized application-facing server state.
 *
 * The pure core (entities, selections, the store, the planner, connections,
 * live classification, optimistic layers) performs no I/O. The `Remote.*`
 * helpers that read or mutate go through the `RemoteClient` Effect service.
 */
import { Duration, Effect, Layer, Option, Result, Schema, Stream } from 'effect'
import { KeyValueStore } from 'effect/persistence'
import {
  Entity as DomainEntity,
  Query as Relational,
  QueryEvaluateError,
  SelectionTypeId,
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
  type ModelRef,
  type Projection,
  type Surface,
  type SurfaceSource,
  type Wiring,
} from 'foldkit-surface'
import {
  RemoteClient,
  coalescedLayer,
  liveEventOf,
  mutateRemote,
  remoteError,
  type RemoteRpcClient,
} from './client.js'
import {
  emptyConnection,
  hasNext,
  hasPrevious,
  isGapped,
  type Connection,
  type Edge,
} from './connection.js'
import {
  Entity,
  type EntityDescriptor,
  type EntityPatch,
  type EntityRef,
  type FieldsFrom,
} from './entity.js'
import { changesOf, impactOn, type HeldConnection } from './impact.js'
import { belongsEncoded, matching, type Judged, type Matched } from './matching.js'

/** A body's dependencies as an explanation carries them: without the owner identity, which holds a symbol. */
const explainedDependencies = (dependencies: Domain.Dependencies): ExplainedDependencies => ({
  fields: dependencies.fields.map(({ entity, key }) => ({ entity, key })),
  inputs: dependencies.inputs,
  operations: dependencies.operations,
})
import {
  inspectEntity,
  inspectRemote,
  type ExplainedDependencies,
  type QueryExplanation,
  type ReadDiagnosis,
  type RemoteInspection,
} from './inspect.js'
import type { LiveCursor, LiveEvent } from './live.js'
import {
  failureOf,
  initialRemoteModel,
  isFieldFailed,
  isLoadingThrough,
  onlyOverlaid,
  windowGrowthKey,
  isQueryLoading,
  isRemoteMessage,
  forgetRemote,
  refreshIsInFlight,
  refreshedAt,
  remoteMessageCases,
  remoteMessageSchema,
  remoteModelSchema,
  retentionRootsSchema,
  invalidateConnections,
  updateRemote,
  withRefreshRequested,
  writeRead,
  type RemoteMessage,
  type RemoteMessageInput,
  type RemoteModel,
} from './model.js'
import {
  mutationStatus,
  optimisticOfWrite,
  type MutationDescriptor,
  type MutationStatus,
} from './mutation.js'
import {
  connectionIdentity,
  emptyOptimistic,
  visibleItems,
  visibleStore,
  type ConnectionIdentity,
  type OptimisticState,
  type OptimisticOperation,
} from './optimistic.js'
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
import { targetsOf } from './relation.js'
import {
  QueryRequest,
  QueryResult,
  ReadRequest,
  RelationRequest,
  REMOTE_PROTOCOL_VERSION,
  WindowSchema,
  RemoteLiveError,
  RemoteMutationError,
  RemoteProtocolError,
  RemoteQueryError,
  RemoteReadError,
  RemoteRpc,
} from './wire.js'
import type { CoalesceOptions } from './coalesce.js'
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

import { http as httpClient, json as jsonClient } from './json.js'
import { httpWithLive as httpWithLiveClient } from './sse.js'
export * from './client.js'
export type { RemoteResumePart } from './resume.js'
export * from './coalesce.js'
export { RemoteJsonAnswer, RemoteJsonRequest, type RemoteJsonSend } from './json.js'
export { httpWithLive, liveFetch, type LiveFetchOptions } from './sse.js'
export * from './connection.js'
export * from './entity.js'
export * from './inspect.js'
export * from './live.js'
export * from './matching.js'
export * from './model.js'
export * from './mutation.js'
export * from './optimistic.js'
export * from './persistence.js'
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
  }
}

declare const boundRemoteNames: unique symbol

export interface BoundRemote<AppModel, Store extends RemoteModel, Names extends string = string> {
  readonly definition: RemoteDescriptor
  readonly store: ModelRef<AppModel, Store>
  /** For `Module`: owns the store's Model path. */
  readonly contract: Contract
  /** Phantom: the entity names this Remote definition registers. */
  readonly [boundRemoteNames]?: Names
}

type MutationInput<M> = M extends MutationDescriptor<any, infer Input, any> ? Input : never

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

export interface DomainMutateOptions {
  /** Overrides the generated id, for a retry, a durable bridge, or a test. */
  readonly requestId?: string | undefined
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
  /** The clock `MutationSucceeded` stamps the answer with; default `Date.now`, read at each use. */
  readonly now?: (() => number) | undefined
  /**
   * For a mutation that is a `Write`: the input keys to write, when only some
   * changed (what an author edited). The rest of the input is still sent, whole.
   */
  readonly keys?: ReadonlyArray<string> | undefined
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
  ActiveSurface<AppModel> | Surface<AppModel, any, any, void> | SurfaceSource<AppModel>

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
 * missed, and its rows may be out of date.
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

export interface SubscriptionsOptions extends ObserveOptions, LiveOptions, RetainOptions {}

/** A Remote domain's wiring for an assembly: it routes Remote's Messages into `reduce`, brings its Subscriptions and contract, and requires `RemoteClient` from the runtime's resources Layer. */
export type RemoteWiring<AppModel> = Wiring<
  AppModel,
  RemoteMessage | RemoteMessageInput,
  RemoteClient
>

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
        Readonly<Record<string, ActiveSurface<AppModel> | SurfaceSource<AppModel>>> | undefined
    },
  ): QueryExplanation
  /**
   * Why a read shows what it shows, in words. Any Remote read: `Data.get`,
   * `Data.live` or `Data.query`.
   *
   * Its point is `Initial`, which means nothing is fetching the read and is
   * almost always a wiring mistake. Given `surfaces`, the same active record
   * `subscriptions` takes, it says which: no active Surface reads it, or one
   * does and Remote's Subscriptions are not running. Pure, like `explain`.
   */
  why(
    model: AppModel,
    projection: Projection<AppModel, RemoteData<unknown>>,
    options?: {
      readonly surfaces?:
        Readonly<Record<string, ActiveSurface<AppModel> | SurfaceSource<AppModel>>> | undefined
    },
  ): ReadDiagnosis
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
  /** `Remote.refresh`: marks what a projection or a Surface requires as due, for its read entry to refetch. */
  refresh(
    model: AppModel,
    target: Projection<AppModel, unknown> | Surface<AppModel, any, any, void>,
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
  ): ActiveSurface<AppModel>
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
  ): Effect.Effect<AppModel, RemoteReadError | RemoteProtocolError | RemoteQueryError, RemoteClient>
  /**
   * The Model with everything the active Surfaces read, for a render that
   * fetches nothing (SSR, a prerender). Each pass prefetches every Surface
   * that plans a read, over the Model the one before it left, so a Surface
   * active only once another's read has arrived is read in the next pass (or
   * the same one, when it comes later in `active`). It stops at the first
   * pass that plans nothing, and fails with `RemoteUnsatisfied` when
   * `options.passes` run out first. Reads are cache-first: a field already
   * held is not asked again.
   */
  satisfy(
    model: AppModel,
    active: Readonly<Record<string, ActiveEntry<AppModel>>>,
    options?: SatisfyOptions,
  ): Effect.Effect<
    AppModel,
    RemoteReadError | RemoteProtocolError | RemoteQueryError | RemoteUnsatisfied,
    RemoteClient
  >
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
   * takes the first claimant.
   */
  wiring: <const Active extends Readonly<Record<string, ActiveEntry<AppModel>>>>(
    active: Active,
    options?: SubscriptionsOptions,
  ) => RemoteWiring<AppModel>
  /**
   * Keeps the cache across a reload, as a wiring beside `wiring`: at start and
   * whenever `key` changes, the stored snapshot is restored (`Hydrated`, with
   * what the store already holds kept over it, so a page resumed from the
   * server wins); and the cache is written back when it changes, once its own
   * snapshot is in. Overlays, optimistic layers, the mutation ledger, live
   * cursors and gaps are never stored. A change of principal should `forget`
   * in `update`, and name another `key`.
   */
  persistence(
    options: PersistenceOptions<AppModel>,
  ): Wiring<AppModel, RemoteMessage, KeyValueStore.KeyValueStore>
  /** `Remote.inspect` of the bound slice. */
  inspect(model: AppModel): RemoteInspection
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

const metaOf = (remote: RemoteModel, asked: Asked): ReadMeta => {
  const visible = visibleStoreOf(remote.entities, remote.optimistic)
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
    if (known.stale) stale = true
    if (isQueryLoading(remote, connection.identity)) loading = true
    for (const edge of visibleItems(
      known,
      connection.identity,
      remote.optimistic.overlays,
      remote.entities,
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
  return visibleStoreOf(remote.entities, remote.optimistic)
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
const visibleStores = new WeakMap<object, WeakMap<EntityStore, EntityStore>>()

const visibleStoreOf = (entities: EntityStore, optimistic: OptimisticState): EntityStore => {
  let byStore = visibleStores.get(optimistic.layers)
  if (byStore === undefined) {
    byStore = new WeakMap()
    visibleStores.set(optimistic.layers, byStore)
  }
  let visible = byStore.get(entities)
  if (visible === undefined) {
    visible = visibleStore(entities, optimistic)
    byStore.set(entities, visible)
  }
  return visible
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
  /** The clock `MutationSucceeded` stamps the answer with; default `Date.now`, read at each use. */
  readonly now?: (() => number) | undefined
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

/** How `Remote.observe` and `Remote.prefetch` treat fields the store already holds. */
export interface ObserveOptions {
  /** Default `RemotePolicy.cacheFirst`. */
  readonly policy?: RemotePolicy | undefined
  /** The clock a refreshing policy reads; default `Date.now`, read at each use. */
  readonly now?: (() => number) | undefined
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

/** A stable key for a live subscription's requirement set. */
const liveStreamKey = (requirements: readonly Requirement[]): string =>
  requirements
    .map(
      requirement =>
        `${entityKey(requirement.entity, requirement.id)}:${[...requirement.fields].sort().join(',')}`,
    )
    .sort()
    .join('|')

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
  store: ModelRef<AppModel, Store>,
): BoundRemote<AppModel, Store, EntityName<Entities[number]>> => ({
  definition,
  store,
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
})

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

/** The plan for what a projection asks: the entity fields to read, and the queries to run. */
interface Planned {
  readonly requirements: ReadonlyArray<Requirement>
  readonly queries: ReadonlyArray<QueryRequirement>
  /** Under a freshness, when what is held next goes stale; `null` when nothing held will. */
  readonly expires: Deadline | null
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

const planAsked = (remote: RemoteModel, asked: Asked, options: PlanOptions): Planned => {
  const queries: QueryRequirement[] = []
  const items: Requirement[] = []
  const connections = Requirement.mergeConnections(
    asked.connections,
  ) as ReadonlyArray<QueryRequirement>
  for (const connection of widest(remote, connections)) {
    const known = remote.connections[connection.identity]
    const failed = options.force !== true && connection.identity in remote.failures.connections
    const size = windowSize(remote, connection)
    if (!failed && (known === undefined || known.stale || options.force === true)) {
      queries.push(
        size === undefined
          ? connection
          : withWindow(
              connection,
              connection.window.first === undefined ? { last: size } : { first: size },
            ),
      )
      continue
    }
    if (known === undefined) continue
    // A wider window than the connection holds asks for the rows it lacks.
    const tail =
      failed || size === undefined ? undefined : missingRows(known, connection.window, size)
    if (tail !== undefined) queries.push(withWindow(connection, tail))
    const edges = visibleItems(
      known,
      connection.identity,
      remote.optimistic.overlays,
      remote.entities,
    )
    items.push(
      ...itemsOf(
        edges.map(edge => edge.ref),
        connection.select,
      ),
    )
  }
  const visible = visibleStoreOf(remote.entities, remote.optimistic)
  const read = [...asked.requirements, ...items]
  const planned = plan(visible, read, options)
  return {
    requirements: options.force === true ? planned : withoutFailedFields(remote, planned),
    queries,
    expires:
      options.freshness === undefined
        ? null
        : (deadlineOf(visible, read, options.freshness) ?? null),
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
const queryRequestOf = (query: {
  readonly identity: string
  readonly window: QueryWindow
  readonly select?: RelationRequirement | undefined
}): Effect.Effect<Schema.Schema.Type<typeof QueryRequest>, RemoteQueryError> => {
  const separator = query.identity.indexOf('\u0000')
  if (separator < 0) {
    return Effect.fail(
      new RemoteQueryError({
        message: `connection "${query.identity}" is not a query's: only a QueryRef identity can be run`,
      }),
    )
  }
  return Effect.try({
    try: () => ({
      query: query.identity.slice(0, separator),
      input: JSON.parse(query.identity.slice(separator + 1)) as unknown,
      window: query.window,
      ...(query.select === undefined ? {} : { select: query.select }),
    }),
    catch: () =>
      new RemoteQueryError({ message: `connection "${query.identity}" carries no encoded input` }),
  })
}

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
   * Under a refreshing policy, when a value the entry holds next ages out and
   * what is due then. Time reaches Remote only as a Message: the entry sleeps
   * until then and emits `RefreshStarted`, which marks the fields stale, and
   * the plan that follows fetches them. A Model that does not change past its
   * `maxAge` is otherwise never looked at again.
   */
  readonly expires: Deadline | null
}

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
  const { policy = RemotePolicy.cacheFirst, now = wallClock } = options
  const read = (requirements: ReadonlyArray<Requirement>) =>
    Effect.map(readMessage(requirements, now), toMessage)
  const run = (query: ReadDependencies['queries'][number]) =>
    Effect.map(queryMessage(query, now), toMessage)
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
      expires: Schema.NullOr(Schema.Struct({ at: Schema.Number, due: Schema.Array(ReadRequest) })),
    }),
    modelToDependencies: model => {
      const remote = bound.store.get(model)
      const asked = askedOf(model)
      const askedKey = stableStringify(asked)
      const at = now()
      let byAsked = planned.get(remote)
      const known = byAsked?.get(askedKey)
      if (known !== undefined && at < known.until) return known.dependencies
      const plan = planAsked(remote, asked, RemotePolicy.toPlan(policy, at))
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
        expires: plan.expires,
      }
      if (byAsked === undefined) {
        byAsked = new Map()
        planned.set(remote, byAsked)
      }
      byAsked.set(askedKey, { until: plan.expires?.at ?? Infinity, dependencies })
      return dependencies
    },
    dependenciesToStream: ({ requirements, queries, refresh, expires }) =>
      Stream.concat(
        Stream.fromIterable([
          ...(requirements.length === 0
            ? []
            : [
                // Absent fields read as `Loading` until the read lands.
                toMessage({ _tag: 'ReadStarted', requests: requirements, refresh }),
                // A refreshing policy also marks the present ones stale.
                ...(RemotePolicy.refreshes(policy)
                  ? [toMessage({ _tag: 'RefreshStarted', requests: requirements })]
                  : []),
              ]),
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
                  toMessage({ _tag: 'RefreshStarted', requests: expires.due }),
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

/** The live entry: subscribes to `requirementsOf(model)` from the Model's resume cursor. */
const liveEntry = <AppModel, Store extends RemoteModel, Message>(
  bound: BoundRemote<AppModel, Store>,
  requirementsOf: (model: AppModel) => ReadonlyArray<Requirement>,
  toMessage: (message: RemoteMessage) => Message,
  options: LiveOptions,
): EntryWithoutKeepAlive<AppModel, Message, LiveDependencies, RemoteClient> => ({
  dependenciesSchema: Schema.Struct({
    requirements: Schema.Array(ReadRequest),
    cursor: resumeCursor,
    floor: Schema.Number,
    restarts: Schema.Number,
    // Read when a break restarts the stream; an applied event resetting it is no reason to.
    failures: resumeCursor,
  }),
  modelToDependencies: model => {
    const requirements = requirementsOf(model)
    const stream = liveStreamKey(requirements)
    const remote = bound.store.get(model)
    const health = remote.streams[stream]
    return {
      requirements,
      cursor: remote.live[stream]?.cursor ?? 0,
      // A stream is the principal's: `forget` moves the floor, and it restarts.
      floor: remote.refresh.floor,
      restarts: health?.restarts ?? 0,
      failures: health?.failures ?? 0,
    }
  },
  dependenciesToStream: ({ requirements, cursor, restarts, failures }) => {
    if (requirements.length === 0) return Stream.empty
    const stream = liveStreamKey(requirements)
    const live = Stream.unwrap(
      Effect.gen(function* () {
        const client = yield* RemoteClient
        return client.live({ requirements, after: cursor })
      }),
    ).pipe(
      Stream.map(event =>
        toMessage({
          _tag: 'LiveReceived',
          stream: liveStreamKey(requirements),
          event,
          now: (options.now ?? wallClock)(),
        }),
      ),
      Stream.catchIf(
        (_error): _error is RemoteLiveError | RemoteProtocolError => true,
        error =>
          Stream.succeed(
            toMessage({
              _tag: 'ReadFailed',
              requests: requirements,
              error: remoteError(error),
              stream: liveStreamKey(requirements),
            }),
          ),
      ),
    )
    if (restarts === 0) return live
    // The server replays nothing a stream missed while it was down, so a
    // restart refetches what the stream covers. It is marked once the stream
    // is subscribing, so the refetch cannot read before what it would miss.
    const resumed = Stream.make(
      toMessage({ _tag: 'RefreshStarted', requests: requirements }),
      toMessage({ _tag: 'GapCleared', stream }),
    )
    return Stream.fromEffect(Effect.sleep(restartDelay(options, failures))).pipe(
      Stream.drain,
      Stream.concat(Stream.merge(live, resumed)),
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
    const fold = (model: AppModel, message: RemoteMessage | RemoteMessageInput) => ({
      model: domain.reduce(model, message),
    })
    return Object.assign(fold, {
      mutate: (...args: Parameters<Domain['mutate']>) => {
        const started = domain.mutate(
          ...(args as Parameters<RemoteDomain<AppModel, any, any, any, any>['mutate']>),
        )
        return { ...started, command: mapMessage(started.command, toParentMessage) }
      },
      subscriptions: (
        active: Readonly<Record<string, ActiveEntry<AppModel>>>,
        options?: SubscriptionsOptions,
      ) =>
        markAll(
          Subscription.lift(brandEntries(domain.subscriptions(active, options)))({
            toChildModel: (model: AppModel) => model,
            toParentMessage,
          }),
        ) as never,
    })
  },

  /**
   * A patch of one entity's values, for a mutation's `optimistic` list or an
   * overlay. Takes a `foldkit-entity` Entity or a Remote descriptor alike, so
   * the domain you declared once is the one you patch:
   * `Remote.patch(Project, 'p1', { name: 'Apollo II' })`. Values are the
   * fields' wire shape, as the server writes them; a relation is its ref key
   * (`'User:u1'`).
   */
  patch: <E extends EntityLike>(
    entity: E,
    id: string,
    values: Partial<Schema.Struct.Encoded<FieldsOf<E>>>,
  ): EntityPatch<NameOf<E>, FieldsOf<E>> =>
    descriptorOf(entity).patch(id, values) as EntityPatch<NameOf<E>, FieldsOf<E>>,

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
  }): RemoteDomain<AppModel, Store, Entities, Queries, Mutations> =>
    bindDomain(defineRemote(config), config.model),

  /**
   * Declares a Remote domain without binding it: its entities, queries, and
   * mutations, plus the submodel. For a domain reused across applications or
   * bound in a test; `Remote.make` is the one-step form.
   */
  define: defineRemote,

  /**
   * Binds a Remote domain to its store's location in the application Model. The
   * registered entity names are carried on the returned value, so `Remote.select`
   * rejects a selection for an entity this domain never declared.
   */
  at: bindRemote,

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
  ): ReadMeta => metaOf(bound.store.get(model), askedOf(projection)),

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
    planAsked(bound.store.get(model), askedOf(projection), options ?? {}).requirements,

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
    planAsked(bound.store.get(model), askedOf(projection), options ?? {}).queries.flatMap(query =>
      query.ref === undefined ? [] : [query.ref],
    ),

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
   * Marks what a projection, or a Surface without params, requires as due again.
   * Called from `update`: every selected field the store holds reads `Refreshing`,
   * and every loaded query connection is invalidated. Nothing is fetched here.
   * The read entries `Data.subscriptions` derives refetch it, because a stale
   * field or connection is planned again under every policy, so a refresh never
   * sends a request beside the entry already observing the same data.
   *
   * A refreshed connection's page replaces its pages, so items the server removed
   * or reordered follow it; pages loaded past the first are dropped and paged
   * again with `next`/`previous`. The read entries restart, so a read or query
   * sent before the refresh is not applied after it.
   *
   * It is also how a failed query is retried: a connection whose query failed
   * is not run again on its own, so its read stays `Failed` until this asks.
   *
   * The projection must be observed, which it is while it is on screen. Live
   * subscriptions are left as they are. For data nothing observes (SSR, tests),
   * use `Remote.prefetch` with `RemotePolicy.networkOnly`. Refreshing what is
   * already being refreshed returns the same Model.
   */
  refresh: <AppModel, Store extends RemoteModel>(
    bound: BoundRemote<AppModel, Store>,
    model: AppModel,
    target: Projection<AppModel, unknown> | Surface<AppModel, any, any, void>,
  ): AppModel => {
    const projection = 'read' in target ? target : target.projection(undefined)
    const remote = bound.store.get(model)
    const asked = askedOf(projection)
    const connections = Requirement.mergeConnections(
      asked.connections,
    ) as ReadonlyArray<QueryRequirement>
    // A loaded connection's current items are marked with the entities; its page
    // is re-run by the read entry, and new items are planned when it lands.
    const items = connections.flatMap(connection => {
      const known = remote.connections[connection.identity]
      return known === undefined
        ? []
        : itemsOf(
            visibleItems(
              known,
              connection.identity,
              remote.optimistic.overlays,
              remote.entities,
            ).map(edge => edge.ref),
            connection.select,
          )
    })
    const requirements = plan(
      visibleStoreOf(remote.entities, remote.optimistic),
      [...asked.requirements, ...items],
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
   * Adapts an Effect RPC client for `RemoteRpc` to `RemoteClient`, so an
   * application provides the transport's RPC layer instead of writing the
   * `LiveChange`-to-`LiveEvent` mapping by hand. The client `RpcClient.make`
   * builds is accepted as it is: when its transport fails (`RpcClientError`),
   * the call fails with its own Remote error, which the application shows and
   * retries like any failed read, query, mutation or live stream.
   */
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

  clientLayer: <R = never>(
    client: RemoteRpcClient<R, RpcClientError.RpcClientError>,
    options: CoalesceOptions = {},
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
                Effect.catchTag('RpcClientError', error =>
                  Effect.fail(new RemoteReadError({ message: error.message })),
                ),
                Effect.provideContext(context),
              ),
            query: request =>
              client.FoldkitRemoteQuery(request).pipe(
                Effect.catchTag('RpcClientError', error =>
                  Effect.fail(new RemoteQueryError({ message: error.message })),
                ),
                Effect.provideContext(context),
              ),
            mutate: request =>
              client.FoldkitRemoteMutate(request).pipe(
                Effect.catchTag('RpcClientError', error =>
                  Effect.fail(new RemoteMutationError({ message: error.message })),
                ),
                Effect.provideContext(context),
              ),
            live: ({ requirements, after }) =>
              client
                .FoldkitRemoteLive({ version: REMOTE_PROTOCOL_VERSION, requirements, after })
                .pipe(
                  Stream.catchTag('RpcClientError', error =>
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
   * together become one batch, and a requirement already in flight is joined.
   * `Remote.clientLayer` applies this; use it on a hand-written client.
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
    options: RetainOptions = {},
  ): EntryWithoutKeepAlive<AppModel, Message, RetentionRoots, never> => {
    const roots = rootsOf(projections, options)
    return {
      dependenciesSchema: retentionRootsSchema,
      modelToDependencies: () => roots,
      dependenciesToStream: current =>
        Stream.fromEffect(
          Effect.succeed(toMessage({ _tag: 'RetentionChanged', roots: current })).pipe(
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

  /**
   * The edges a connection shows: its server-known region with pending and
   * confirmed overlays placed around it, minus removed edges and edges whose
   * target is a tombstone.
   */
  visibleItems: (model: RemoteModel, connection: ConnectionIdentity): ReadonlyArray<Edge> => {
    const identity = connectionIdentity(connection)
    return visibleItems(
      model.connections[identity] ?? emptyConnection,
      identity,
      model.optimistic.overlays,
      model.entities,
    )
  },

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
    const outcome = yield* mutateRemote(mutation, input, requestId)
    const settled = updateRemote(started, {
      _tag: 'MutationSucceeded',
      requestId,
      entities: outcome.entities,
      connections: outcome.connections,
      deleted: outcome.deleted,
      now: (options.now ?? wallClock)(),
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
    liveEntry(bound, () => requirementsOf(surface.projection(params)), toMessage, options),
}

// A domain's Subscription entries are unbranded so an application can spread
// them into its own `Subscription.make`; wiring hands them over as a branded record.
const brandEntries = <AppModel>(
  entries: Readonly<Record<string, RemoteEntry<AppModel, any>>>,
): Subscription.Subscriptions<AppModel, RemoteMessage, RemoteClient> =>
  Subscription.make<AppModel, RemoteMessage, RemoteClient>()(() => entries)

/** Why a read failed, in words: Remote's own failures say what to do, and a server's error says itself. */
const failedReadWords = (error: RemoteError): string => {
  // tag-check: open — a server names its own errors; only these three are Remote's.
  switch (error._tag) {
    case 'DecodeError':
      return `What the server sent does not decode against the Selection: ${error.message}`
    case 'Unavailable':
      return `${error.message} Select without it, or Data.refresh asks again.`
    case 'Overlaid':
      return `${error.message} Overlay every field the Selection reads, or select fewer.`
    default:
      return `Its request failed: ${error.message}. Nothing retries a failed read on its own; Data.refresh asks again.`
  }
}

/** The bound domain: the descriptor, the binding, and the operations over them. */
const bindDomain = <
  AppModel,
  Store extends RemoteModel,
  Entities extends readonly EntityLike[],
  Queries extends readonly QueryDescriptor<any, any, any>[],
  Mutations extends readonly MutationDescriptor<any, any, any>[],
>(
  definition: RemoteDescriptor<Entities, Queries, Mutations>,
  store: ModelRef<AppModel, Store>,
): RemoteDomain<AppModel, Store, Entities, Queries, Mutations> => {
  const bound = bindRemote(definition, store)
  // Every reader any `subscriptions` call names, and every connection one keeps:
  // retention is the domain's, so each call's retain entry roots them all, and
  // one call with its own policy does not collect what another call reads.
  const readers = new Map<
    ActiveEntry<AppModel>,
    (model: AppModel) => ReadonlyArray<NamedProjection<AppModel>>
  >()
  const keptConnections = new Set<string>()
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
        ? reduced
        : invalidateConnections(reduced, invalidatedBy(reduced, answer, remote.entities))
    return next === remote ? model : store.set(model, next as Store)
  }

  /**
   * The loaded connections a write may have changed the rows of, judged by
   * each connection's body against the store as the write left it.
   */
  const invalidatedBy = (
    remote: RemoteModel,
    answer: Extract<RemoteMessage, { readonly _tag: 'MutationSucceeded' }>,
    // The store before the answer, to tell a value it changed from one it repeated.
    before: EntityStore,
  ): ReadonlyArray<string> => {
    const changes = changesOf(answer, before)
    if (changes.length === 0) return []
    // A list the answer itself changed is as the server says it is now.
    const named = new Set((answer.connections ?? []).map(change => change.connection))
    const visible = visibleStoreOf(remote.entities, remote.optimistic)
    return Object.keys(remote.connections).filter(identity => {
      if (named.has(identity)) return false
      const separator = identity.indexOf(IDENTITY_SEPARATOR)
      const descriptor = definition.registry.queries.get(identity.slice(0, separator))
      if (descriptor === undefined) return false
      const held: HeldConnection = {
        descriptor,
        encoded: JSON.parse(identity.slice(separator + 1)) as Record<string, unknown>,
        holds: new Set(
          visibleItems(
            remote.connections[identity]!,
            identity,
            remote.optimistic.overlays,
            remote.entities,
          ).map(edge => entityKey(edge.ref.entity, edge.ref.id)),
        ),
      }
      return changes.some(change => impactOn(held, visible, change)._tag === 'Invalidated')
    })
  }
  // Two applications can have the same Model type; the owner token tells them apart.
  const assertOwned = (entry: ActiveEntry<AppModel>) => {
    if (bound.contract.owner !== undefined && entry.owner !== bound.contract.owner) {
      throw new Error(
        `Remote: Surface "${entry.name}" belongs to another application than domain "${bound.contract.name}"`,
      )
    }
    const from = (entry as { readonly from?: ActiveSurface<AppModel> }).from
    if (
      from !== undefined &&
      bound.contract.owner !== undefined &&
      from.owner !== bound.contract.owner
    ) {
      throw new Error(
        `Remote: Surface "${from.name}" belongs to another application than domain "${bound.contract.name}"`,
      )
    }
  }
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
        const asked = (model: AppModel) =>
          askedUnion(resolvedAt(model).map(({ projection }) => projection))
        entries[`${key}.read`] = observeEntry(bound, asked, identityMessage, options)
        entries[`${key}.live`] = liveEntry(
          bound,
          model => asked(model).requirements.filter(requirement => requirement.live === true),
          identityMessage,
          options,
        )
      }
      for (const identity of options.connections ?? [])
        keptConnections.add(connectionIdentity(identity))
      entries.retain = {
        dependenciesSchema: retentionRootsSchema,
        modelToDependencies: model =>
          rootsOf(
            [...readers.values()].flatMap(resolvedAt =>
              resolvedAt(model).map(({ projection }) => projection),
            ),
            { connections: [...keptConnections] },
          ),
        dependenciesToStream: (current: RetentionRoots) =>
          Stream.fromEffect(
            Effect.succeed<RemoteMessage>({ _tag: 'RetentionChanged', roots: current }).pipe(
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
    prefetch: (model, projection, options = {}) =>
      Effect.gen(function* () {
        const { policy = RemotePolicy.cacheFirst, now = wallClock } = options
        const client = yield* RemoteClient
        const planOptions = RemotePolicy.toPlan(policy, now())
        let current = model
        // The pages first, so their items join the one entity read below. A
        // page with a payload already writes its items' selected fields, so
        // the read below is only for what the server left out.
        for (const query of planAsked(store.get(current), askedOf(projection), planOptions)
          .queries) {
          const page = yield* queryRequestOf(query).pipe(
            Effect.flatMap(request => client.query(request)),
          )
          current = reduce(
            current,
            pageMessage(query.identity, page, true, query.window, query.select, now()),
          )
        }
        const requirements = planAsked(
          store.get(current),
          askedOf(projection),
          planOptions,
        ).requirements
        if (requirements.length === 0) return current
        const at = now()
        const result = yield* client.read({
          version: REMOTE_PROTOCOL_VERSION,
          requests: requirements,
        })
        return reduce(current, { _tag: 'ReadReceived', requests: requirements, result, now: at })
      }),
    satisfy: (model, active, options = {}) =>
      Effect.gen(function* () {
        const { passes = 8, now = wallClock } = options
        const entries = Object.values(active)
        entries.forEach(assertOwned)
        const planOptions = RemotePolicy.toPlan(RemotePolicy.cacheFirst, now())
        const plans = (
          current: AppModel,
          projections: ReadonlyArray<Projection<AppModel, unknown>>,
        ) => {
          const planned = planAsked(store.get(current), askedUnion(projections), planOptions)
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
              current = yield* domain.prefetch(current, projection, { now })
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
      }),
    query: <Q extends QueryDescriptor<any, any, any>, Value, Entity extends string>(
      query: Q,
      input: QueryInput<Q>,
      options: QueryOptions<Value, Entity, QueryEntity<Q>>,
    ): QueryProjection<AppModel, Value, Q['name'], QueryInput<Q>> => {
      assertRegistered(bound, 'Query', definition.registry.queries, query.name)
      const { select: given, ...window } = options
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
      const { ref, relation, requirement } = readContract(query.ref(input), select, window)
      const relationKey = stableStringify(relation)
      // A read shows at most its window, whatever else loaded the connection:
      // a picker's `first: 50` and a Block's `first: 3` of one query share it.
      const sizeOf = (remote: RemoteModel) => windowSize(remote, ref)
      const shown = (remote: RemoteModel, connection: Connection) =>
        cutToWindow(
          visibleItems(connection, ref.identity, remote.optimistic.overlays, remote.entities),
          ref.window,
          sizeOf(remote),
        )
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
      // The page as the rows held make it, before any failure is laid over it;
      // `undefined` when a row is missing a field.
      const readPage = (
        remote: RemoteModel,
        connection: Connection,
      ): RemoteData<Page<Value>> | undefined => {
        const visible = visibleStoreOf(remote.entities, remote.optimistic)
        return memoRead<RemoteData<Page<Value>> | undefined>(
          [visible, connection, remote.optimistic.overlays],
          `${ref.identity}\u0000${relationKey}\u0000${String(sizeOf(remote))}`,
          () => {
            const items: Value[] = []
            let refreshing = connection.stale
            const { edges, cutBefore, cutAfter } = shown(remote, connection)
            for (const edge of edges) {
              const key = entityKey(edge.ref.entity, edge.ref.id)
              const assembled = assemble(visible, key, relation)
              if (assembled === undefined) return unavailableFailure(visible, key, relation)
              const decoded = decodeRow(select.schema, visible[key]!.values, assembled.values)
              if (Result.isFailure(decoded)) {
                return {
                  _tag: 'Failed',
                  error: { _tag: 'DecodeError', message: decoded.failure.message },
                }
              }
              refreshing ||= assembled.refreshing
              items.push(decoded.success)
            }
            const page = {
              items,
              hasNext: cutAfter || hasNext(connection),
              hasPrevious: cutBefore || hasPrevious(connection),
            }
            return refreshing ? { _tag: 'Refreshing', value: page } : { _tag: 'Ready', value: page }
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
      const state = projection.read(model)
      const asked = askedOf(projection)
      const reading =
        options?.surfaces === undefined
          ? undefined
          : Object.values(options.surfaces).flatMap(source =>
              resolvedOf(source, model)
                .filter(({ projection: shown }) => covers(askedOf(shown), asked))
                .map(({ name }) => name),
            )
      const withSurfaces = reading === undefined ? {} : { surfaces: reading }
      switch (state._tag) {
        case 'Ready':
          return { state: state._tag, message: 'Everything it selects is here.', ...withSurfaces }
        case 'Refreshing':
          return {
            state: state._tag,
            message: 'It is shown while a newer value is fetched.',
            ...withSurfaces,
          }
        case 'Loading':
          return { state: state._tag, message: 'A request for it is in flight.', ...withSurfaces }
        case 'NotFound':
          return {
            state: state._tag,
            message:
              'The server answered without it: it does not exist, or this principal may not see it.',
            ...withSurfaces,
          }
        case 'Failed':
          return {
            state: state._tag,
            message: failedReadWords(state.error),
            ...withSurfaces,
          }
        case 'Initial':
          if (reading === undefined) {
            return {
              state: state._tag,
              reason: 'Unknown',
              message:
                'Nothing is fetching it. Pass the active record you give Data.subscriptions as `surfaces` to tell whether an active Surface reads it.',
            }
          }
          return reading.length === 0
            ? {
                state: state._tag,
                reason: 'NotObserved',
                message:
                  'No active Surface reads it, so nothing fetches it. Include it in a Surface that is active for this Model, in the record given to Data.subscriptions.',
                surfaces: reading,
              }
            : {
                state: state._tag,
                reason: 'NotFetching',
                message: `${reading.join(', ')} ${reading.length === 1 ? 'reads it and is' : 'read it and are'} active, yet nothing is fetching it. Remote's Subscriptions are most likely not installed: give the runtime Data.subscriptions (or Data.wiring) and a RemoteClient.`,
                surfaces: reading,
              }
      }
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
      const visible = visibleStoreOf(remote.entities, remote.optimistic)
      const edges =
        connection === undefined
          ? []
          : visibleItems(connection, over.ref.identity, remote.optimistic.overlays, remote.entities)
      const among = edges.map(edge => entityKey(edge.ref.entity, edge.ref.id))
      let judged: Judged
      try {
        judged = matching(visible, by, input, { among })
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
    refresh: (model, target) => Remote.refresh(bound, model, target),
    forget: model => Remote.forget(bound, model),
    overlay: (model, id, optimistic) => reduce(model, { _tag: 'OverlayShown', id, optimistic }),
    lift: (model, id) => reduce(model, { _tag: 'OverlayLifted', id }),
    mutate: (model, mutation, input, options = {}) => {
      assertRegistered(bound, 'Mutation', definition.registry.mutations, mutation.name)
      const remote = store.get(model)
      const requestId =
        options.requestId ?? `${bound.contract.name}-${remote.mutations.sequence + 1}`
      const tempId = `${requestId}.tmp`
      // A declared write shows what it writes until the server answers; one given wins.
      const optimistic =
        typeof options.optimistic === 'function'
          ? options.optimistic({ requestId, tempId })
          : (options.optimistic ??
            (mutation.write === undefined
              ? undefined
              : optimisticOfWrite(mutation.write, input, options.keys)))
      const started = updateRemote(remote, {
        _tag: 'MutationStarted',
        requestId,
        ...(optimistic === undefined ? {} : { optimistic }),
      })
      return {
        model: store.set(model, started as Store),
        requestId,
        tempId,
        command: {
          name: `Remote.mutate(${mutation.name})`,
          args: { requestId },
          effect: mutateRemote(mutation, input, requestId, options.keys).pipe(
            Effect.match({
              onFailure: (error): RemoteMessage => ({
                _tag: 'MutationFailed',
                requestId,
                error: remoteError(error),
              }),
              onSuccess: (outcome): RemoteMessage => ({
                _tag: 'MutationSucceeded',
                requestId,
                entities: outcome.entities,
                connections: outcome.connections,
                deleted: outcome.deleted,
                now: (options.now ?? wallClock)(),
              }),
            }),
          ),
        },
      }
    },
    mutation: (model, requestId) => mutationStatus(store.get(model).mutations, requestId),
    refusal: (model, requestId, mutation) => {
      const status = mutationStatus(store.get(model).mutations, requestId)
      if (status._tag !== 'Failed') return Option.none()
      const { refusal } = status.error
      return refusal === undefined
        ? Option.none()
        : Schema.decodeUnknownOption(mutation.Refusal)(refusal)
    },
    liveStatus: (model, active) => {
      assertOwned(active)
      const resolvedAt = readers.get(active) ?? memoizedResolved(active)
      const requirements = askedUnion(
        resolvedAt(model).map(({ projection }) => projection),
      ).requirements.filter(requirement => requirement.live === true)
      if (requirements.length === 0) return { _tag: 'Idle' }
      const remote = store.get(model)
      const stream = liveStreamKey(requirements)
      const health = remote.streams[stream]
      return health === undefined || !remote.gaps.has(stream)
        ? { _tag: 'Live' }
        : { _tag: 'Reconnecting', attempt: health.failures, error: health.error }
    },
    reduce,
    inspect: model => inspectRemote(store.get(model)),
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
      const restore: EntryWithoutKeepAlive<
        AppModel,
        RemoteMessage,
        { readonly key: string; readonly scope: string },
        KeyValueStore.KeyValueStore
      > = {
        dependenciesSchema: Schema.Struct({ key: Schema.String, scope: Schema.String }),
        modelToDependencies: model => ({ key: options.key(model), scope: options.scope(model) }),
        // A store that cannot be read restores nothing, so nothing is saved
        // under this key: an unread snapshot is never written over.
        dependenciesToStream: ({ key, scope }) =>
          Stream.fromEffect(
            RemotePersistence.restore({ key, scope, maxBytes: options.maxBytes }).pipe(
              Effect.option,
            ),
          ).pipe(
            Stream.flatMap(read =>
              Option.match(read, {
                onNone: (): Stream.Stream<RemoteMessage> => Stream.empty,
                onSome: (snapshot): Stream.Stream<RemoteMessage> =>
                  Stream.make({
                    _tag: 'Hydrated',
                    entities: snapshot.entities,
                    connections: snapshot.connections,
                    merge: 'preserve-existing',
                    from: key,
                  }),
              }),
            ),
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
          () => ({ 'persistence.restore': restore, 'persistence.save': save }),
        ),
      }
    },
    wiring: (active, options): RemoteWiring<AppModel> => ({
      key: `remote:${bound.contract.name}`,
      // Every domain claims the same tags with no per-domain discriminator, so
      // the assembly's claimant check keeps one assembly to one domain.
      handles: Object.keys(remoteMessageCases),
      route: (model, message) =>
        isRemoteMessage(message) ? Option.some({ model: reduce(model, message) }) : Option.none(),
      subscriptions: brandEntries(domain.subscriptions(active, options)),
      contract: bound.contract,
    }),
  }
  return domain
}

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

const pickWindow = (window: QueryWindowOptions): QueryWindow => ({
  ...(window.first === undefined ? {} : { first: window.first }),
  ...(window.last === undefined ? {} : { last: window.last }),
  ...(window.after === undefined ? {} : { after: window.after }),
  ...(window.before === undefined ? {} : { before: window.before }),
})
