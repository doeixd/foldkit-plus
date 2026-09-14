/**
 * `foldkit-remote` — normalized application-facing server state.
 *
 * The pure core (entities, selections, the store, the planner, connections,
 * live classification, optimistic layers) performs no I/O. The `Remote.*`
 * helpers that read or mutate go through the `RemoteClient` Effect service.
 */
import { Effect, Layer, Result, Schema, Stream } from 'effect'
import type { Duration } from 'effect'
import type { Command } from 'foldkit/command'
import type { EntryWithoutKeepAlive } from 'foldkit/subscription'
import {
  type ActiveSurface,
  type Contract,
  type Invalid,
  type ModelRef,
  type Projection,
  type Surface,
} from 'foldkit-surface'
import {
  RemoteClient,
  coalescedLayer,
  liveEventOf,
  mutateRemote,
  remoteError,
  type RemoteRpcClient,
} from './client.js'
import { emptyConnection, hasNext, hasPrevious, type Edge } from './connection.js'
import type { EntityDescriptor } from './entity.js'
import { inspectEntity, inspectRemote, type RemoteInspection } from './inspect.js'
import type { LiveCursor } from './live.js'
import {
  initialRemoteModel,
  isLoading,
  isRemoteMessage,
  remoteMessageCases,
  remoteMessageSchema,
  remoteModelSchema,
  retentionRootsSchema,
  updateRemote,
  writeRead,
  type RemoteMessage,
  type RemoteMessageInput,
  type RemoteModel,
} from './model.js'
import type { MutationDescriptor } from './mutation.js'
import {
  connectionIdentity,
  visibleItems,
  visibleStore,
  type ConnectionIdentity,
  type OptimisticState,
  type OptimisticOperation,
} from './optimistic.js'
import { plan, type PlanOptions } from './plan.js'
import { RemotePolicy } from './policy.js'
import { stableStringify } from './query.js'
import type { ConnectionSpec, QueryDescriptor, QueryRef, QueryWindow } from './query.js'
import { remoteDataSchema, type RemoteData } from './remoteData.js'
import type { ConnectionRoot, RetentionRoots } from './retain.js'
import { assemble, pageSchema, relationOf, type Page, type Selection } from './selection.js'
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

type EntityName<D> = D extends EntityDescriptor<infer Name, any> ? Name : never
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
  Entities extends readonly EntityDescriptor<any, any>[] = readonly EntityDescriptor<any, any>[],
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
  readonly [K in keyof Active & string as `${K}.read` | `${K}.live`]: RemoteEntry<AppModel, any>
} & { readonly retain: RemoteEntry<AppModel, any> }

export interface SubscriptionsOptions extends ObserveOptions, LiveOptions, RetainOptions {}

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
  Entities extends readonly EntityDescriptor<any, any>[],
  Queries extends readonly QueryDescriptor<any, any, any>[],
  Mutations extends readonly MutationDescriptor<any, any, any>[],
>
  extends
    BoundRemote<AppModel, Store, EntityName<Entities[number]>>,
    RemoteDescriptor<Entities, Queries, Mutations> {
  /** `Remote.select`: a Projection reading one entity through a selection of a registered entity. */
  get<Value, Name extends string>(
    selection: Selection<Value, Name, 'entity'> &
      Registered<Name, EntityName<Entities[number]>, 'Entity'>,
    id: string,
  ): Projection<AppModel, RemoteData<Value>>
  /**
   * `get`, and the projection also subscribes to the entity's changes: its
   * requirements are marked `live`, so `subscriptions` derives a live entry for
   * the Surfaces that read it.
   */
  live<Value, Name extends string>(
    selection: Selection<Value, Name, 'entity'> &
      Registered<Name, EntityName<Entities[number]>, 'Entity'>,
    id: string,
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
  /** A Command that runs the query and yields the `ConnectionMerged` (or `QueryFailed`) that reduces it: "load more". */
  fetch(ref: QueryRef<string, unknown>): Command<RemoteMessage, never, RemoteClient>
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
  /** `updateRemote` on the bound slice: reduces one of Remote's Messages, as `RemoteMessage` or as the application's union constructs it. */
  reduce(model: AppModel, message: RemoteMessage | RemoteMessageInput): AppModel
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
  readonly select: Selection<Value, Entity, 'entity'> & SelectsEntity<Entity, Of>
} & QueryWindowOptions

/** A query connection read as a `Page` of selected items; `ref` is the connection with its first window. */
export interface QueryProjection<AppModel, Value, Name extends string, Input> extends Projection<
  AppModel,
  RemoteData<Page<Value>>
> {
  readonly ref: QueryRef<Name, Input>
}

/** The input of a query descriptor. */
export type QueryInput<Q> = Q extends QueryDescriptor<any, infer Input, any> ? Input : never
/** The entity a query's connection is over. */
export type QueryEntity<Q> =
  Q extends QueryDescriptor<any, any, ConnectionSpec<infer Entity>> ? Entity : string

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
  const Entities extends readonly EntityDescriptor<any, any>[],
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
}): RemoteDescriptor<Entities, Queries, Mutations> => ({
  entities: config.entities,
  queries: (config.queries ?? []) as unknown as Queries,
  mutations: (config.mutations ?? []) as unknown as Mutations,
  Model: remoteModelSchema(),
  initial: initialRemoteModel,
  Message: remoteMessageSchema,
  update: updateRemote,
  rpc: RemoteRpc,
  registry: {
    entities: new Map(config.entities.map(entity => [entity.name, entity])),
    queries: new Map((config.queries ?? []).map(query => [query.name, query])),
    mutations: new Map((config.mutations ?? []).map(mutation => [mutation.name, mutation])),
  },
})

/** Binds a Remote domain to its store's location in the application Model. */
const bindRemote = <
  AppModel,
  Store extends RemoteModel,
  Entities extends readonly EntityDescriptor<any, any>[],
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
 */
const planAsked = (remote: RemoteModel, asked: Asked, options: PlanOptions): Planned => {
  const queries: QueryRequirement[] = []
  const items: Requirement[] = []
  const connections = Requirement.mergeConnections(
    asked.connections,
  ) as ReadonlyArray<QueryRequirement>
  for (const connection of connections) {
    const known = remote.connections[connection.identity]
    if (known === undefined || known.stale || options.force === true) {
      queries.push(connection)
      continue
    }
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
  return {
    requirements: plan(
      visibleStoreOf(remote.entities, remote.optimistic),
      [...asked.requirements, ...items],
      options,
    ),
    queries,
  }
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
const pageMessage = (
  connection: string,
  result: Schema.Schema.Type<typeof QueryResult>,
  refreshes = false,
): RemoteMessage => ({
  _tag: 'ConnectionMerged',
  connection,
  page: {
    edges: result.edges.map(edge => ({ key: edge.key, ref: { entity: edge.entity, id: edge.id } })),
    start: result.start,
    end: result.end,
  },
  ...(refreshes ? { refreshes } : {}),
})

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
      : pageMessage(query.identity, result.success, true)
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
    }),
    modelToDependencies: model => {
      const planned = planAsked(
        bound.store.get(model),
        askedOf(model),
        RemotePolicy.toPlan(policy, now()),
      )
      return {
        requirements: planned.requirements,
        queries: planned.queries.map(({ identity, window, select }) => ({
          identity,
          window,
          select,
        })),
      }
    },
    dependenciesToStream: ({ requirements, queries }) =>
      Stream.concat(
        requirements.length === 0
          ? Stream.empty
          : Stream.fromIterable([
              // Absent fields read as `Loading` until the read lands.
              toMessage({ _tag: 'ReadStarted', requests: requirements }),
              // A refreshing policy also marks the present ones stale.
              ...(RemotePolicy.refreshes(policy)
                ? [toMessage({ _tag: 'RefreshStarted', requests: requirements })]
                : []),
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
   * Declares a Remote domain and binds it to its place in the application Model
   * in one step; the result carries the application-facing operations. The
   * descriptor alone is `Remote.define`, the binding alone `Remote.at`.
   */
  make: <
    AppModel,
    Store extends RemoteModel,
    const Entities extends readonly EntityDescriptor<any, any>[],
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
    selection: Selection<Value, Name, 'entity'> & Registered<Name, Names, 'Entity'>,
  ) => {
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
        if (present !== undefined) return present
        // Nothing is fetching this: usually a projection no active Surface
        // observes, rather than a slow network.
        return isLoading(bound.store.get(root), selection.entity, id, relation.fields)
          ? { _tag: 'Loading' }
          : { _tag: 'Initial' }
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
   * The projection must be observed, which it is while it is on screen. Live
   * subscriptions are left as they are. For data nothing observes (SSR, tests),
   * use `Remote.prefetch` with `RemotePolicy.networkOnly`.
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

    const marks: RemoteMessage[] = [
      ...(requirements.length === 0
        ? []
        : [{ _tag: 'RefreshStarted' as const, requests: requirements }]),
      // A connection the Model never loaded is already a query to run.
      ...connections
        .filter(connection => remote.connections[connection.identity] !== undefined)
        .map(connection => ({
          _tag: 'ConnectionInvalidated' as const,
          connection: connection.identity,
        })),
    ]
    return marks.length === 0
      ? model
      : bound.store.set(model, marks.reduce(updateRemote, remote) as Store)
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
  ): RemoteMessage => pageMessage(ref.identity, result),

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
   * requirements, emitting a `LiveReceived` per event and a `ReadFailed` when
   * the stream breaks (including `ResumeUnavailable`). The resume cursor is read
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

/** The bound domain: the descriptor, the binding, and the operations over them. */
const bindDomain = <
  AppModel,
  Store extends RemoteModel,
  Entities extends readonly EntityDescriptor<any, any>[],
  Queries extends readonly QueryDescriptor<any, any, any>[],
  Mutations extends readonly MutationDescriptor<any, any, any>[],
>(
  definition: RemoteDescriptor<Entities, Queries, Mutations>,
  store: ModelRef<AppModel, Store>,
): RemoteDomain<AppModel, Store, Entities, Queries, Mutations> => {
  const bound = bindRemote(definition, store)
  // An application-union case has the runtime shape of the `RemoteMessage` it names.
  const reduce = (model: AppModel, message: RemoteMessage | RemoteMessageInput): AppModel =>
    store.set(model, updateRemote(store.get(model), message as RemoteMessage) as Store)
  return {
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
          current = reduce(current, pageMessage(query.identity, page, true))
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
      const { select, ...window } = options
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
        read: (root: AppModel): RemoteData<Page<Value>> => {
          const remote = store.get(root)
          const connection = remote.connections[ref.identity]
          // Invalidating a connection the Model never loaded records it stale with no
          // segments: still nothing to show. (A loaded empty page is not stale.)
          if (connection === undefined || (connection.stale && connection.segments.length === 0)) {
            return { _tag: 'Initial' }
          }
          const visible = visibleStoreOf(remote.entities, remote.optimistic)
          return memoRead(visible, connection, `${ref.identity}\u0000${relationKey}`, () => {
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
              if (assembled === undefined) return { _tag: 'Initial' }
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
          })
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
    refresh: (model, target) => Remote.refresh(bound, model, target),
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
          onSuccess: (page): RemoteMessage => pageMessage(ref.identity, page),
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
              }),
            }),
          ),
        },
      }
    },
    reduce,
    inspect: model => inspectRemote(store.get(model)),
  }
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
