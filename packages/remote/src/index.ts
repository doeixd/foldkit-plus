/**
 * `foldkit-remote` — normalized application-facing server state.
 *
 * The pure core (entities, selections, the store, the planner, connections,
 * live classification, optimistic layers) performs no I/O. The `Remote.*`
 * helpers that read or mutate go through the `RemoteClient` Effect service.
 */
import { Effect, Layer, Option, Result, Schema, Stream } from 'effect'
import { Entity as DomainEntity, Query as Relational, SelectionTypeId } from 'foldkit-entity'
import type * as Domain from 'foldkit-entity'
import type { Duration } from 'effect'
import type { Command } from 'foldkit/command'
import * as Subscription from 'foldkit/subscription'
import type { EntryWithoutKeepAlive } from 'foldkit/subscription'
import {
  type ActiveSurface,
  type Contract,
  type Invalid,
  type ModelRef,
  type Projection,
  type Surface,
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
import { belongsEncoded, matching, type Matched } from './matching.js'
import {
  inspectEntity,
  inspectRemote,
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
  isQueryLoading,
  isRemoteMessage,
  refreshIsInFlight,
  refreshedAt,
  remoteMessageCases,
  remoteMessageSchema,
  remoteModelSchema,
  retentionRootsSchema,
  updateRemote,
  withRefreshRequested,
  writeRead,
  type RemoteMessage,
  type RemoteMessageInput,
  type RemoteModel,
} from './model.js'
import { mutationStatus, type MutationDescriptor, type MutationStatus } from './mutation.js'
import {
  connectionIdentity,
  emptyOptimistic,
  visibleItems,
  visibleStore,
  type ConnectionIdentity,
  type OptimisticState,
  type OptimisticOperation,
} from './optimistic.js'
import { plan, type PlanOptions } from './plan.js'
import { RemotePolicy } from './policy.js'
import { IDENTITY_SEPARATOR, stableStringify } from './query.js'
import type { ConnectionSpec, LivePolicy, QueryDescriptor, QueryRef, QueryWindow } from './query.js'
import { remoteDataSchema, type RemoteData, type RemoteError } from './remoteData.js'
import type { ConnectionRoot, RetentionRoots } from './retain.js'
import { Selection, assemble, pageSchema, relationOf, type Page } from './selection.js'
import { entityKey, isTombstone, type EntityStore } from './store.js'
import {
  QueryRequest,
  QueryResult,
  ReadRequest,
  RelationRequest,
  REMOTE_PROTOCOL_VERSION,
  WindowSchema,
  RemoteLiveError,
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

export * from './client.js'
export * from './coalesce.js'
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
}

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
export type SubscriptionEntries<AppModel, Active> = {
  // `Object.entries` turns a numeric key into a string, so numeric keys have entries too.
  readonly [K in keyof Active & (string | number) as `${K}.read` | `${K}.live`]: RemoteEntry<
    AppModel,
    any
  >
} & { readonly retain: RemoteEntry<AppModel, any> }

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
  /** The `QueryRef` for the page after the loaded end (same page size), or `undefined` when there is none or its cursor is unknown. */
  next<Name extends string, Input>(
    model: AppModel,
    projection: QueryProjection<AppModel, any, Name, Input>,
  ): QueryRef<Name, Input> | undefined
  /** The `QueryRef` for the page before the loaded start, or `undefined`. */
  previous<Name extends string, Input>(
    model: AppModel,
    projection: QueryProjection<AppModel, any, Name, Input>,
  ): QueryRef<Name, Input> | undefined
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
      readonly surfaces?: Readonly<Record<string, ActiveSurface<AppModel>>> | undefined
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
      readonly surfaces?: Readonly<Record<string, ActiveSurface<AppModel>>> | undefined
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
  /** A Command that runs the query and yields the `ConnectionMerged` (or `QueryFailed`) that reduces it: "load more". */
  fetch(ref: QueryRef<string, unknown>): Command<RemoteMessage, never, RemoteClient>
  /**
   * Shows operations over the store with no request behind them, as a mutation's
   * `optimistic` ones show while it is in flight: every Selection and view draws
   * them. For a preview of a change nobody has made. They stay until `lift`;
   * showing an id again replaces what it showed. Called from `update`.
   */
  overlay(model: AppModel, id: string, optimistic: ReadonlyArray<OptimisticOperation>): AppModel
  /** Lifts what `overlay` showed under this id. Lifting nothing returns the same Model. */
  lift(model: AppModel, id: string): AppModel
  /** `Remote.refresh`: marks what a projection or a Surface requires as due, for its read entry to refetch. */
  refresh(
    model: AppModel,
    target: Projection<AppModel, unknown> | Surface<AppModel, any, any, void>,
  ): AppModel
  /**
   * The Foldkit Subscription entries for the active Surfaces, keyed for
   * `Subscription.make`: a read entry per Surface (`Remote.observe`), a live
   * entry per Surface that reads through `live` (`Remote.live`), and one
   * retain entry with every active Surface as a root (`Remote.retain`). A
   * Surface's params are a function of the Model (`Surface.at`), so what is
   * fetched, subscribed, and retained follows the Model.
   */
  subscriptions<
    const Active extends Readonly<
      Record<string, ActiveSurface<AppModel> | Surface<AppModel, any, any, void>>
    >,
  >(
    active: Active,
    options?: SubscriptionsOptions,
  ): SubscriptionEntries<AppModel, Active>
  /** `Remote.plan`: the requirements the store does not satisfy. */
  plan<Value>(
    model: AppModel,
    projection: Projection<AppModel, Value>,
    options?: PlanOptions,
  ): ReadonlyArray<Requirement>
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
  /** `updateRemote` on the bound slice: reduces one of Remote's Messages, as `RemoteMessage` or as the application's union constructs it. */
  reduce(model: AppModel, message: RemoteMessage | RemoteMessageInput): AppModel
  /**
   * How this domain joins an assembly: it routes Remote's Messages into
   * `reduce`, brings its Subscriptions and contract, and requires
   * `RemoteClient` from the runtime's resources Layer. One assembly holds at
   * most one Remote wiring: every domain claims the same tags, and routing
   * takes the first claimant.
   */
  wiring: <
    const Active extends Readonly<
      Record<string, ActiveSurface<AppModel> | Surface<AppModel, any, any, void>>
    >,
  >(
    active: Active,
    options?: SubscriptionsOptions,
  ) => RemoteWiring<AppModel>
  /** `Remote.inspect` of the bound slice. */
  inspect(model: AppModel): RemoteInspection
}

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
// change, so reads and plans across renders of one Model share it.
const visibleStores = new WeakMap<OptimisticState, WeakMap<EntityStore, EntityStore>>()

const visibleStoreOf = (entities: EntityStore, optimistic: OptimisticState): EntityStore => {
  let byStore = visibleStores.get(optimistic)
  if (byStore === undefined) {
    byStore = new WeakMap()
    visibleStores.set(optimistic, byStore)
  }
  let visible = byStore.get(entities)
  if (visible === undefined) {
    visible = visibleStore(entities, optimistic)
    byStore.set(entities, visible)
  }
  return visible
}

// A read's result per store snapshot. `Remote.storeOf` is shared across every
// read of one Model state, so equal reads of one render assemble and decode
// once and return one value (a view may compare by identity). A query read
// also depends on its connection, which changes independently of the store,
// so it keys on that object too. Weak on both, bounded by what is read.
const readResults = new WeakMap<object, WeakMap<object, Map<string, unknown>>>()

const memoRead = <T>(snapshot: object, by: object, key: string, compute: () => T): T => {
  let byScope = readResults.get(snapshot)
  if (byScope === undefined) {
    byScope = new WeakMap()
    readResults.set(snapshot, byScope)
  }
  let results = byScope.get(by)
  if (results === undefined) {
    results = new Map()
    byScope.set(by, results)
  }
  if (results.has(key)) return results.get(key) as T
  const value = compute()
  results.set(key, value)
  return value
}

export interface MutateOptions {
  /** What the request changes before the server answers; released when it settles. */
  readonly optimistic?: ReadonlyArray<OptimisticOperation> | undefined
}

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
  /** The clock a refreshing policy reads; default `Date.now`. */
  readonly now?: (() => number) | undefined
}

export interface LiveOptions {
  /** The clock `LiveReceived` stamps events with; default `Date.now`. */
  readonly now?: (() => number) | undefined
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

const nothingAsked: Asked = { requirements: [], connections: [] }

const askedOf = (projection: Projection<any, unknown> | undefined): Asked =>
  projection === undefined
    ? nothingAsked
    : { requirements: requirementsOf(projection), connections: connectionsOf(projection) }

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
const planAsked = (remote: RemoteModel, asked: Asked, options: PlanOptions): Planned => {
  const queries: QueryRequirement[] = []
  const items: Requirement[] = []
  const connections = Requirement.mergeConnections(
    asked.connections,
  ) as ReadonlyArray<QueryRequirement>
  for (const connection of connections) {
    const known = remote.connections[connection.identity]
    const failed = options.force !== true && connection.identity in remote.failures.connections
    if (!failed && (known === undefined || known.stale || options.force === true)) {
      queries.push(connection)
      continue
    }
    if (known === undefined) continue
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
  const planned = plan(
    visibleStoreOf(remote.entities, remote.optimistic),
    [...asked.requirements, ...items],
    options,
  )
  return {
    requirements: options.force === true ? planned : withoutFailedFields(remote, planned),
    queries,
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
const queryMessage = (query: {
  readonly identity: string
  readonly window: QueryWindow
}): Effect.Effect<RemoteMessage, never, RemoteClient> =>
  Effect.gen(function* () {
    const client = yield* RemoteClient
    const result = yield* Effect.result(
      queryRequestOf(query).pipe(Effect.flatMap(request => client.query(request))),
    )
    return Result.isFailure(result)
      ? { _tag: 'QueryFailed', connection: query.identity, error: remoteError(result.failure) }
      : pageMessage(query.identity, result.success, true, query.window)
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
  const { policy = RemotePolicy.cacheFirst, now = Date.now } = options
  const read = (requirements: ReadonlyArray<Requirement>) =>
    Effect.map(readMessage(requirements, now), toMessage)
  const run = (query: ReadDependencies['queries'][number]) =>
    Effect.map(queryMessage(query), toMessage)
  return {
    dependenciesSchema: Schema.Struct({
      requirements: Schema.Array(ReadRequest),
      queries: Schema.Array(PlannedQuery),
      refresh: Schema.Number,
    }),
    modelToDependencies: model => {
      const remote = bound.store.get(model)
      const planned = planAsked(remote, askedOf(model), RemotePolicy.toPlan(policy, now()))
      return {
        refresh: refreshedAt(
          remote.refresh,
          planned.requirements,
          planned.queries.map(query => query.identity),
        ),
        requirements: planned.requirements,
        queries: planned.queries.map(({ identity, window, select }) => ({
          identity,
          window,
          select,
        })),
      }
    },
    dependenciesToStream: ({ requirements, queries, refresh }) =>
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
        Stream.mergeAll(
          [
            ...(requirements.length === 0 ? [] : [Stream.fromEffect(read(requirements))]),
            ...queries.map(query => Stream.fromEffect(run(query))),
          ],
          { concurrency: 'unbounded' },
        ),
      ),
  }
}

/** The live entry: subscribes to `requirementsOf(model)` from the Model's resume cursor. */
const liveEntry = <AppModel, Store extends RemoteModel, Message>(
  bound: BoundRemote<AppModel, Store>,
  requirementsOf: (model: AppModel) => ReadonlyArray<Requirement>,
  toMessage: (message: RemoteMessage) => Message,
  options: LiveOptions,
): EntryWithoutKeepAlive<
  AppModel,
  Message,
  { readonly requirements: ReadonlyArray<Requirement>; readonly cursor: LiveCursor },
  RemoteClient
> => ({
  dependenciesSchema: Schema.Struct({
    requirements: Schema.Array(ReadRequest),
    cursor: Schema.Number,
  }),
  modelToDependencies: model => {
    const requirements = requirementsOf(model)
    const stream = liveStreamKey(requirements)
    return {
      requirements,
      cursor: bound.store.get(model).live[stream]?.cursor ?? 0,
    }
  },
  dependenciesToStream: ({ requirements, cursor }) =>
    requirements.length === 0
      ? Stream.empty
      : Stream.unwrap(
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
              now: (options.now ?? Date.now)(),
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
        ),
})

/** The projection an active Surface has for this Model, if it is active. */
const projectionOf = <AppModel>(
  entry: ActiveSurface<AppModel> | Surface<AppModel, any, any, void>,
  model: AppModel,
): Projection<AppModel, unknown> | undefined =>
  'projectionOf' in entry ? entry.projectionOf(model) : entry.projection()

/**
 * `projectionOf` computed once per Model: the read, live, and retain entries
 * all derive their dependencies from the same projection on the same Model
 * change, and a Surface's `model` callback (which lifts and builds schemas)
 * need not run three times for it. Models are objects, so the memo is weak.
 */
const memoizedProjectionOf = <AppModel>(
  entry: ActiveSurface<AppModel> | Surface<AppModel, any, any, void>,
): ((model: AppModel) => Projection<AppModel, unknown> | undefined) => {
  const cache = new WeakMap<object, Projection<AppModel, unknown> | undefined>()
  return model => {
    const key: unknown = model
    if (typeof key !== 'object' || key === null) return projectionOf(entry, model)
    if (cache.has(key)) return cache.get(key)
    const projection = projectionOf(entry, model)
    cache.set(key, projection)
    return projection
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
          store,
          store,
          `${key}\u0000${stableStringify(relation)}`,
          () => {
            if (isTombstone(store, key)) return { _tag: 'NotFound' }
            const assembled = assemble(store, key, relation)
            if (assembled === undefined) return undefined
            const decoded = Schema.decodeUnknownResult(selection.schema)(assembled.values)
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
        // Nothing is fetching this. Either its read failed, which is said, or no
        // active Surface observes it, which is usually a wiring mistake.
        return failure === undefined ? { _tag: 'Initial' } : { _tag: 'Failed', error: failure }
      },
    })
  },

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
    const { policy = RemotePolicy.cacheFirst, now = Date.now } = options
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
   * Writes a read result into the store, recording each field's applied window.
   * `requests` are the planned requirements the result answers.
   */
  writeRead,

  /**
   * Adapts an Effect RPC client for `RemoteRpc` to `RemoteClient`, so an
   * application provides the transport's RPC layer instead of writing the
   * `LiveChange`-to-`LiveEvent` mapping by hand.
   */
  clientLayer: <R = never>(
    client: RemoteRpcClient<R>,
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
            read: batch => client.FoldkitRemoteRead(batch).pipe(Effect.provideContext(context)),
            query: request =>
              client.FoldkitRemoteQuery(request).pipe(Effect.provideContext(context)),
            mutate: request =>
              client.FoldkitRemoteMutate(request).pipe(Effect.provideContext(context)),
            live: ({ requirements, after }) =>
              client
                .FoldkitRemoteLive({ version: REMOTE_PROTOCOL_VERSION, requirements, after })
                .pipe(Stream.map(liveEventOf), Stream.provideContext(context)),
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
   */
  query: Effect.fn('Remote.query')(function* <Name extends string, Input>(
    ref: QueryRef<Name, Input>,
  ) {
    const client = yield* RemoteClient
    const input = yield* Schema.encodeUnknownEffect(ref.Input)(ref.input).pipe(
      Effect.catchTag('SchemaError', error =>
        Effect.fail(new RemoteQueryError({ message: error.message })),
      ),
    )
    return yield* client.query({ query: ref.query, input, window: ref.window })
  }),

  /** The `RemoteMessage` that merges a query page into its connection. */
  queryMessage: <Name extends string, Input>(
    ref: QueryRef<Name, Input>,
    result: Schema.Schema.Type<typeof QueryResult>,
  ): RemoteMessage => pageMessage(ref.identity, result, false, ref.window),

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
   * read, since nothing was being read. The resume cursor is read
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
  ): EntryWithoutKeepAlive<
    AppModel,
    Message,
    { readonly requirements: ReadonlyArray<Requirement>; readonly cursor: LiveCursor },
    RemoteClient
  > => liveEntry(bound, () => requirementsOf(surface.projection(params)), toMessage, options),
}

// A domain's Subscription entries are unbranded so an application can spread
// them into its own `Subscription.make`; wiring hands them over as a branded record.
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
  store: ModelRef<AppModel, Store>,
): RemoteDomain<AppModel, Store, Entities, Queries, Mutations> => {
  const bound = bindRemote(definition, store)
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
      (message as RemoteMessage)._tag === 'LiveReceived'
        ? (message as Extract<RemoteMessage, { _tag: 'LiveReceived' }>)
        : undefined
    // A caller that said what it wanted keeps it; `updateRemote` on its own is
    // unchanged, so the pure reducer stays testable without a registry.
    const resolved =
      live === undefined || live.policy !== undefined
        ? message
        : { ...live, policy: livePolicyFor(model, live.event) }
    return store.set(model, updateRemote(store.get(model), resolved as RemoteMessage) as Store)
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
    subscriptions: (active, options = {}) => {
      // Dependencies differ per entry, as in Foldkit's own `Subscriptions` record.
      const entries: Record<string, RemoteEntry<AppModel, any>> = {}
      const projections: Array<(model: AppModel) => Projection<AppModel, unknown> | undefined> = []
      for (const [key, entry] of Object.entries(active)) {
        // Two applications can have the same Model type; the owner token tells them apart.
        if (bound.contract.owner !== undefined && entry.owner !== bound.contract.owner) {
          throw new Error(
            `Remote: Surface "${entry.name}" belongs to another application than domain "${bound.contract.name}"`,
          )
        }
        const projectionAt = memoizedProjectionOf(entry)
        projections.push(projectionAt)
        const asked = (model: AppModel) => askedOf(projectionAt(model))
        entries[`${key}.read`] = observeEntry(bound, asked, identityMessage, options)
        entries[`${key}.live`] = liveEntry(
          bound,
          model => asked(model).requirements.filter(requirement => requirement.live === true),
          identityMessage,
          options,
        )
      }
      entries.retain = {
        dependenciesSchema: retentionRootsSchema,
        modelToDependencies: model =>
          rootsOf(
            projections.flatMap(projectionAt => {
              const projection = projectionAt(model)
              return projection === undefined ? [] : [projection]
            }),
            options,
          ),
        dependenciesToStream: (current: RetentionRoots) =>
          Stream.fromEffect(
            Effect.succeed<RemoteMessage>({ _tag: 'RetentionChanged', roots: current }).pipe(
              Effect.delay(options.grace ?? 0),
            ),
          ),
      }
      // The loop above wrote exactly the keys the mapped type names.
      return entries as SubscriptionEntries<AppModel, typeof active>
    },
    plan: (model, projection, options) => Remote.plan(bound, model, projection, options),
    storeOf: model => storeOf(bound, model),
    confirmed: projection => confirmed(bound, projection),
    prefetch: (model, projection, options = {}) =>
      Effect.gen(function* () {
        const { policy = RemotePolicy.cacheFirst, now = Date.now } = options
        const client = yield* RemoteClient
        const planOptions = RemotePolicy.toPlan(policy, now())
        let current = model
        // The pages first, so their items join the one entity read below.
        for (const query of planAsked(store.get(current), askedOf(projection), planOptions)
          .queries) {
          const page = yield* queryRequestOf(query).pipe(
            Effect.flatMap(request => client.query(request)),
          )
          current = reduce(current, pageMessage(query.identity, page, true, query.window))
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
      const ref: QueryRef<Q['name'], QueryInput<Q>> = {
        ...query.ref(input),
        window: pickWindow(window),
      }
      const relation = relationOf(select)
      const relationKey = stableStringify(relation)
      // The first failed field among the rows a list shows, if any. Decided
      // outside the memo, which is keyed on the store and the connection: a
      // failure can arrive without either changing.
      const failedItem = (
        remote: RemoteModel,
        connection: Connection,
      ): { readonly _tag: 'Failed'; readonly error: RemoteError } | undefined => {
        if (Object.keys(remote.failures.fields).length === 0) return undefined
        for (const edge of visibleItems(
          connection,
          ref.identity,
          remote.optimistic.overlays,
          remote.entities,
        )) {
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
        for (const edge of visibleItems(
          connection,
          ref.identity,
          remote.optimistic.overlays,
          remote.entities,
        )) {
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
          visible,
          connection,
          `${ref.identity}\u0000${relationKey}`,
          () => {
            const items: Value[] = []
            let refreshing = connection.stale
            const edges = visibleItems(
              connection,
              ref.identity,
              remote.optimistic.overlays,
              remote.entities,
            )
            for (const edge of edges) {
              const assembled = assemble(visible, entityKey(edge.ref.entity, edge.ref.id), relation)
              if (assembled === undefined) return undefined
              const decoded = Schema.decodeUnknownResult(select.schema)(assembled.values)
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
              hasNext: hasNext(connection),
              hasPrevious: hasPrevious(connection),
            }
            return refreshing ? { _tag: 'Refreshing', value: page } : { _tag: 'Ready', value: page }
          },
        )
      }
      const requirement: QueryRequirement = {
        identity: ref.identity,
        window: ref.window,
        select: relation,
        ref,
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
            default:
              return { _tag: 'Failed', error: failure }
          }
        },
      }
    },
    next: (model, projection) => {
      const segments = store.get(model).connections[projection.ref.identity]?.segments ?? []
      const end = segments[segments.length - 1]?.end
      return end?._tag === 'Cursor'
        ? {
            ...projection.ref,
            window: { ...pageSize(projection.ref.window, 'first'), after: end.cursor },
          }
        : undefined
    },
    previous: (model, projection) => {
      const start = store.get(model).connections[projection.ref.identity]?.segments[0]?.start
      return start?._tag === 'Cursor'
        ? {
            ...projection.ref,
            window: { ...pageSize(projection.ref.window, 'last'), before: start.cursor },
          }
        : undefined
    },
    explain: (model, projection, options) => {
      const { ref } = projection
      // Which active Surfaces read this connection, asked of the Model rather
      // than of the projection: a Surface's projection is rebuilt per Model, so
      // the only honest comparison is by connection identity.
      const reading = Object.values(options?.surfaces ?? {}).filter(active => {
        const active_ = active.projectionOf(model)
        // An inactive Surface reads nothing, which is not the same as reading
        // something else.
        return (
          active_ !== undefined &&
          connectionsOf(active_).some(connection => connection.identity === ref.identity)
        )
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
          : { body: Relational.show(body), dependencies: Relational.dependencies(body) }),
        state: projection.read(model)._tag,
        ...(options?.surfaces === undefined
          ? {}
          : {
              surfaces: reading.map(active => active.name),
              activation: reading.flatMap(active =>
                active.activation === undefined
                  ? []
                  : [{ surface: active.name, ...active.activation }],
              ),
            }),
      }
    },
    why: (model, projection, options) => {
      const state = projection.read(model)
      const asked = askedOf(projection)
      const reading =
        options?.surfaces === undefined
          ? undefined
          : Object.values(options.surfaces)
              .filter(active => {
                const shown = active.projectionOf(model)
                return shown !== undefined && covers(askedOf(shown), asked)
              })
              .map(active => active.name)
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
            message:
              state.error._tag === 'DecodeError'
                ? `What the server sent does not decode against the Selection: ${state.error.message}`
                : `Its request failed: ${state.error.message}. Nothing retries a failed read on its own; Data.refresh asks again.`,
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
      const judged = matching(visible, by, input, { among })
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
        const decoded = Schema.decodeUnknownResult(over.selection.schema)(assembled.values)
        if (Result.isFailure(decoded)) {
          assembledAll = false
          continue
        }
        items.push(decoded.success)
      }

      return {
        items: items as never,
        // Whole only if every edge was judged, every match could be shown, and
        // the list itself is all there — a connection terminal at both ends.
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
    overlay: (model, id, optimistic) =>
      bound.store.set(
        model,
        updateRemote(bound.store.get(model), { _tag: 'OverlayShown', id, optimistic }) as Store,
      ),
    lift: (model, id) => {
      const remote = bound.store.get(model)
      const lifted = updateRemote(remote, { _tag: 'OverlayLifted', id })
      return lifted === remote ? model : bound.store.set(model, lifted as Store)
    },
    fetch: ref => ({
      name: `Remote.query(${ref.query})`,
      args: { connection: ref.identity, window: ref.window },
      effect: Remote.query(ref).pipe(
        Effect.match({
          onFailure: (error): RemoteMessage => ({
            _tag: 'QueryFailed',
            connection: ref.identity,
            error: remoteError(error),
          }),
          onSuccess: (page): RemoteMessage => pageMessage(ref.identity, page, false, ref.window),
        }),
      ),
    }),
    mutate: (model, mutation, input, options = {}) => {
      assertRegistered(bound, 'Mutation', definition.registry.mutations, mutation.name)
      const remote = store.get(model)
      const requestId =
        options.requestId ?? `${bound.contract.name}-${remote.mutations.sequence + 1}`
      const tempId = `${requestId}.tmp`
      const optimistic =
        typeof options.optimistic === 'function'
          ? options.optimistic({ requestId, tempId })
          : options.optimistic
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
          effect: mutateRemote(mutation, input, requestId).pipe(
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
              }),
            }),
          ),
        },
      }
    },
    mutation: (model, requestId) => mutationStatus(store.get(model).mutations, requestId),
    reduce,
    inspect: model => inspectRemote(store.get(model)),
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
const pickWindow = (window: QueryWindowOptions): QueryWindow => ({
  ...(window.first === undefined ? {} : { first: window.first }),
  ...(window.last === undefined ? {} : { last: window.last }),
  ...(window.after === undefined ? {} : { after: window.after }),
  ...(window.before === undefined ? {} : { before: window.before }),
})

/** The page size of a window, carried onto the next or previous page's window under `key`. */
const pageSize = (window: QueryWindow, key: 'first' | 'last'): QueryWindow => {
  const size = window.first ?? window.last
  return size === undefined ? {} : { [key]: size }
}
