/**
 * A Remote domain's declarations and the pure reading over them: what
 * `Remote.define` and `Remote.at` build, the plan, the store a read sees, and
 * the types the bound domain is made of. Internal; `index.ts` exports its types
 * and `remote.ts` its operations.
 */
import { EdgeCache, type CachePolicy } from './edgeCache.js'
import { Clock, Duration, Effect, Option, Record, Result, Schema, Stream } from 'effect'
import {
  Derivation,
  Entity as DomainEntity,
  ReadFilter,
  SelectionTypeId,
  type MemoryOperators,
} from 'foldkit-entity'
import type * as Domain from 'foldkit-entity'
import type { Command } from 'foldkit/command'
import type * as Update from 'foldkit/update'
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
import { RemoteClient, defectAsFailure, remoteError } from './client.js'
import { madeAsOf } from './queue.js'
import type { Connection, Edge } from './connection.js'
import { Entity, type EntityDescriptor, type FieldsFrom } from './entity.js'
import {
  Capability,
  Installs,
  connectionIdentity,
  edgesOf,
  emptyOptimistic,
  noCapabilities,
  plannedOf,
  requestOnlyOf,
  visibleOf,
  type Capabilities,
  type ConnectionIdentity,
} from './capability.js'
import { assertRegistered } from './registered.js'
import type { Can, CapabilityChecks, CapabilityRequest } from './can.js'
import { parsedQueryRequest } from './queryRequest.js'
import { resolvedOf, type Asked, type NamedProjection } from './active.js'

import type { RemoteInspection } from './inspect.js'
import type { LiveCursor } from './liveState.js'
import {
  connectionMark,
  failureOf,
  fieldMark,
  initialRemoteModel,
  isFieldFailed,
  isLoadingThrough,
  onlyOverlaid,
  ownedMarks,
  windowGrowthKey,
  isQueryLoading,
  refreshedAt,
  remoteMessageSchema,
  remoteModelSchema,
  readsStale,
  type RemoteMessage,
  type RemoteMessageInput,
  type RemoteMessageTag,
  type RemoteModel,
} from './model.js'
import { DerivedBy } from './derived.js'
import type { MutationStatus } from './ledger.js'
import type { MutationDescriptor } from './mutationDescriptor.js'
import { domainFacts } from './graphFacts.js'
import type { OptimisticOperation } from './optimistic.js'
import {
  deadlineOf,
  plan,
  refreshedOf,
  withTokens,
  type Deadline,
  type PlanOptions,
} from './plan.js'
import { RemotePolicy } from './policy.js'
import { stableStringify } from './query.js'
import type { ConnectionSpec, QueryDescriptor, QueryRef, QueryWindow } from './query.js'
import { remoteDataSchema, type RemoteData, type RemoteError } from './remoteData.js'
import { heldForHistory, type ConnectionRoot, type RetentionRoots } from './retain.js'
import { marked, persistOf, type PersistOption } from './persist.js'
import { Selection, relationOf, type Page } from './selection.js'
import { recent, type Recent } from './recent.js'
import { INITIAL, LOADING, NOT_FOUND, failedWith, readRow } from './rowRead.js'
import { entityKey, isTombstone, missingFields, readField, type EntityStore } from './store.js'
import { targetsOf } from './relation.js'
import {
  QueryRequest,
  QueryResult,
  ReadRequest,
  RelationRequest,
  REMOTE_PROTOCOL_VERSION,
  RowToken,
  WindowSchema,
  RemoteProtocolError,
  RemoteQueryError,
  RemoteReadError,
  RemoteRpc,
  RemoteUnauthenticated,
  RemoteUnreachable,
} from './wire.js'
import { withCallTimeout } from './deadline.js'
import {
  Requirement,
  RemoteRequirements,
  connectionsOf,
  requirementsOf,
  type ConnectionRequirement,
  type RelationRequirement,
} from './requirement.js'

/** What a domain registers: a Remote descriptor, or a `foldkit-entity` Entity (read through `Entity.from`). */
export type EntityLike = EntityDescriptor<any, any> | Domain.AnyEntity

/**
 * What a read selects: a Remote Selection, or a `foldkit-entity` Selection
 * (read through `Selection.from`).
 */
export type EntitySelection<Value, Name extends string, Id extends string = string> =
  | Selection<Value, Name, 'entity'>
  | Domain.Selection<Name, unknown, Schema.Constraint & { readonly Type: Value }, Id>

export const descriptorOf = (entity: EntityLike): EntityDescriptor<any, any> =>
  DomainEntity.is(entity) ? Entity.from(entity as never) : entity

/** The Remote descriptor either kind of entity reads as, at the type level. */
type DescriptorOf<E extends EntityLike> =
  E extends EntityDescriptor<any, any>
    ? E
    : E extends Domain.AnyEntity
      ? EntityDescriptor<E['name'], FieldsFrom<E>>
      : never

export type NameOf<E extends EntityLike> =
  DescriptorOf<E> extends EntityDescriptor<infer N, any> ? N : never
export type FieldsOf<E extends EntityLike> =
  DescriptorOf<E> extends EntityDescriptor<any, infer F> ? F : never

export const selectionOf = <Value, Name extends string>(
  selection: EntitySelection<Value, Name>,
): Selection<Value, Name, 'entity'> =>
  SelectionTypeId in selection ? (Selection.from(selection) as never) : selection

export type EntityName<D> = D extends { readonly name: infer Name extends string } ? Name : never
export type QueryName<D> = D extends QueryDescriptor<infer Name, any, any> ? Name : never
export type MutationName<D> = D extends MutationDescriptor<infer Name, any, any> ? Name : never

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
    /** Per entity name, how long a public read of its rows stays fresh (`EdgeCache.of`). */
    readonly cached: ReadonlyMap<string, CachePolicy>
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
   * The table `Remote.make` was given for running primitive operators, which a
   * pending computed assignment is predicted by wherever the store is read;
   * none for the kernel's (`Operators.kernel`), which only what judges a body
   * on the client loads (#397).
   */
  readonly operators: Option.Option<MemoryOperators>
  /**
   * What the domain's declarations installed (#378): empty until something
   * that makes a pending layer does, so a domain that only reads runs, and a
   * page that only reads loads, none of the code that shows one.
   */
  readonly [Capability]: Capabilities
  /** Phantom: the entity names this Remote definition registers. */
  readonly [boundRemoteNames]?: Names
}

/**
 * `unknown` on a domain that registers a mutation; on one that registers none,
 * what refuses every request id `retry` is given, as `Registered` refuses
 * every mutation `mutate` is.
 */
export type Writes<Mutations extends readonly MutationDescriptor<any, any, any>[]> = [
  MutationName<Mutations[number]>,
] extends [never]
  ? Invalid<'this Remote domain registers no mutations, so it has nothing to retry'>
  : unknown

type MutationInput<M> = M extends MutationDescriptor<any, infer Input, any> ? Input : never
type MutationRefusal<M> =
  M extends MutationDescriptor<any, any, any, infer Refused> ? Refused : never

export interface DomainMutateOptions {
  /** Overrides the generated id, for a retry, a durable bridge, or a test. Not with `durable`. */
  readonly requestId?: string | undefined
  /**
   * Queues the write in `outbox(Data, …)` rather than sending it: stored first,
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
  /**
   * The read-after tokens of the rows `requirements` names that hold one
   * (`LiveRequirement.floors`): a new one restarts the stream, so the server
   * holds the row to it.
   */
  readonly tokens: ReadonlyArray<Schema.Schema.Type<typeof RowToken>>
  /** How many times the stream broke; each break restarts it. */
  readonly restarts: number
  /** Breaks since its last applied event, which the restart's backoff grows with. */
  readonly failures: number
}

export interface SubscriptionsOptions<AppModel = never>
  extends ObserveOptions<AppModel>, LiveOptions, RetainOptions {}

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
  AppModel = never,
> extends SubscriptionsOptions<AppModel> {
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
   * live entry per record entry, which streams what it reads live (`live`, `liveQuery`), and
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
    options?: SubscriptionsOptions<AppModel>,
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
    options?: ObserveOptions<AppModel>,
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
   * fetches nothing (SSR, a prerender). Each pass reads what every Surface
   * plans in one read, over the Model the pass began with, so a Surface
   * active only once another's read has arrived is read in the next pass,
   * wherever it comes in `active`. It stops at the first
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
   * Whether a registered write would be refused, told from what `model` holds
   * and in the order the server refuses: a held `may`, the write's `when`,
   * then the invariants of the row it leaves. `input` may leave keys out: a
   * `when` that reads one is undecided, and the invariants are judged over the
   * row with the keys given. A hint only: `mutate` still asks the server, and a
   * `No(Unmet)` is answered as written when the server finds the row already
   * where the write puts it. Throws for a mutation not declared as a `Write`.
   */
  can<M extends MutationDescriptor<any, any, any>>(
    model: AppModel,
    mutation: M & Registered<M['name'], MutationName<Mutations[number]>, 'Mutation'>,
    input: Partial<MutationInput<M>>,
  ): Can
  /**
   * An agent capability's `authorize` and `applies`, from `can` over the write
   * it dispatches, for spreading into a `foldkit-agent` variant. `toInput`
   * turns the call into the write's input. A held `may` that forbids refuses
   * in `authorize`, with its words; a `when` that does not hold, or a broken
   * invariant, refuses in `applies`, which the agent asks only once
   * `authorize` allowed; `Undecided` allows, since the server decides. Judged
   * as the Model's viewer, not as the agent's principal. A key written after
   * the spread replaces the one given here.
   */
  capability<
    M extends MutationDescriptor<any, any, any>,
    Input,
    Principal = unknown,
    // `const`, so a literal the write's input asks for is not widened before `M` is known.
    const Given extends Partial<MutationInput<M>> = Partial<MutationInput<M>>,
  >(
    mutation: M & Registered<M['name'], MutationName<Mutations[number]>, 'Mutation'>,
    toInput: (request: CapabilityRequest<AppModel, Input, Principal>) => Given,
  ): CapabilityChecks<AppModel, Input, Principal>
  /**
   * An agent capability's `available`, for one over a row the Model alone
   * names (the selected one): false while `inputOf` names none, or while
   * `can` answers `No` for the write with that input.
   */
  available<M extends MutationDescriptor<any, any, any>>(
    mutation: M & Registered<M['name'], MutationName<Mutations[number]>, 'Mutation'>,
    inputOf: (model: AppModel) => Option.Option<NoInfer<Partial<MutationInput<M>>>>,
  ): (model: AppModel) => boolean
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
  retry(
    model: AppModel,
    requestId: string & Writes<Mutations>,
  ): Option.Option<MutationStarted<AppModel>>
  /**
   * Forgets a failed write, so `failedWrites` no longer lists it; a durable one,
   * or one the outbox cannot read, goes from its store and every tab. Anything
   * else (a write still waiting, too) returns the same Model.
   */
  dismiss(model: AppModel, requestId: string): AppModel
  /**
   * Reports from `update` that the principal the outbox's `scope` names is
   * signed in again: the durable writes the server answered `Unauthenticated`
   * wait their turn again, and the outbox sends them, then those held behind
   * them, in order. Call it once the application knows who is signed in (its
   * sign-in answered, or a reload read who it is), after any change of
   * `scope`: only the queue of the scope the page holds is sent, never
   * another person's. A write made for someone else than who signs in
   * (`PrincipalChanged`) is refused again, and waits on. The same Model when
   * none waits for a sign-in.
   */
  signedIn(model: AppModel): AppModel
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
    options?: WiringOptions<Shared, AppModel>,
  ) => RemoteWiring<AppModel, Shared>
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
    options?: SubscriptionsOptions<AppModel>,
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

export const readContract = <Name extends string, Input, Value, Entity extends string>(
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
 * decodes, stays its Selection. Which fields those are is the body
 * capability's, which the query's descriptor installed (`Query.define`).
 */
export const placeableReadContract = <Name extends string, Input>(
  capabilities: Capabilities,
  contract: ReadContract<Name, Input>,
  body: Domain.AnyQuery | undefined,
  operators: Option.Option<MemoryOperators>,
): ReadContract<Name, Input> => {
  if (body === undefined || Option.isNone(capabilities.bodies)) return contract
  const { requirement, ref } = contract
  const encoded = Schema.encodeSync(ref.Input)(ref.input) as Readonly<Record<string, unknown>>
  const missing = capabilities.bodies.value
    .placedFields(body, encoded, operators)
    .filter(field => !requirement.select.fields.includes(field))
  if (missing.length === 0) return contract
  return {
    ...contract,
    requirement: {
      ...requirement,
      select: { ...requirement.select, fields: [...requirement.select.fields, ...missing] },
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

export const metaOf = (
  bound: BoundRemote<any, any>,
  remote: RemoteModel,
  asked: Asked,
): ReadMeta => {
  const visible = visibleOf(bound[Capability], remote, bound.operators)
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
    for (const edge of edgesOf(bound[Capability], remote, connection.identity, known)) {
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
export const storeOf = <AppModel, Store extends RemoteModel, Names extends string>(
  bound: BoundRemote<AppModel, Store, Names>,
  model: AppModel,
): EntityStore => {
  return visibleOf(bound[Capability], bound.store.get(model), bound.operators)
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

/**
 * The projection read against the server-derived store alone: the same
 * requirements, planned the same way, with the pending optimistic layers and
 * connection overlays left off. See the bound `Remote.confirmed`.
 */
export const confirmed = <AppModel, Store extends RemoteModel, P extends Projection<AppModel, any>>(
  bound: BoundRemote<AppModel, Store>,
  projection: P,
): P => ({
  ...projection,
  read: (root: AppModel) => projection.read(withoutOptimistic(bound, root)),
})

/**
 * `Remote.select`'s reader for one domain and Selection, kept by the
 * Selection's identity: `Data.get(Quote, name)` runs on every render, and
 * compiling the relation, its key and the requirement each time cost more
 * than the read (#384). It gives one Projection per id while the id is
 * recent, so a memo downstream can key on it.
 */
export const selectReaders = new WeakMap<
  object,
  WeakMap<object, (id: string) => Projection<any, any>>
>()

/** The ids whose Projection a reader keeps: `recent`'s two generations of this. */
const HANDLES_KEPT = 4096

export const selectReader = <AppModel, Store extends RemoteModel, Names extends string, Value>(
  bound: BoundRemote<AppModel, Store, Names>,
  selection: Selection<Value, string, 'entity'>,
): ((id: string) => Projection<AppModel, RemoteData<Value>>) => {
  assertRegistered(bound, 'Entity', bound.definition.registry.entities, selection.entity)
  const relation = relationOf(selection)
  const relationKey = stableStringify(relation)
  const Model = remoteDataSchema(selection.schema)
  const handles = recent<string, Projection<AppModel, RemoteData<Value>>>(HANDLES_KEPT)
  const make = (id: string): Projection<AppModel, RemoteData<Value>> => ({
    Model,
    dependencies: [],
    metadata: RemoteRequirements.of({ ...relation, id }),
    read: (root: AppModel): RemoteData<Value> => {
      const store = storeOf(bound, root)
      const key = entityKey(selection.entity, id)
      // What the row's data reads as, kept while its entries are; `undefined`
      // means the store lacks the value. Whether that reads as `Loading` or
      // `Initial` depends on the in-flight marks, which change independently
      // of the store, so it is decided after.
      const present = isTombstone(store, key)
        ? NOT_FOUND
        : readRow(store, key, relation, relationKey, selection.schema)
      // Decided after, as loading is: a failure can arrive without the store
      // changing.
      const remote = bound.store.get(root)
      const failure = failureOf(remote, selection.entity, id, relation)
      if (present !== undefined) {
        // A value on screen whose refresh failed stays on screen, with the
        // error, which `RemoteData.render` draws as stale.
        if (failure !== undefined && (present._tag === 'Ready' || present._tag === 'Refreshing'))
          return failedWith(present, failure)
        return present
      }
      if (isLoadingThrough(remote, selection.entity, id, relation)) return LOADING
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
      return INITIAL
    },
  })
  return id => {
    const known = handles.get(id)
    if (known !== undefined) return known
    const made = make(id)
    handles.set(id, made)
    return made
  }
}

/** The lists whose last page a domain keeps: `recent`'s two generations of this. */
export const PAGES_KEPT = 256

/**
 * `read`, or the page last read under `key` when it reads the same: the same
 * rows, by identity and in order, and the same bounds and state.
 */
export const keptPage = <Value>(
  pages: Recent<string, RemoteData<Page<unknown>>>,
  key: string,
  read: RemoteData<Page<Value>>,
): RemoteData<Page<Value>> => {
  const before = pages.get(key) as RemoteData<Page<Value>> | undefined
  if (
    before !== undefined &&
    before._tag === read._tag &&
    (read._tag === 'Ready' || read._tag === 'Refreshing') &&
    (before._tag === 'Ready' || before._tag === 'Refreshing') &&
    samePage(before.value, read.value)
  ) {
    return before
  }
  return read
}

const samePage = <Value>(left: Page<Value>, right: Page<Value>): boolean =>
  left.hasNext === right.hasNext &&
  left.hasPrevious === right.hasPrevious &&
  left.items.length === right.items.length &&
  left.items.every((item, index) => item === right.items[index])

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
export const wallClock = (): number => Date.now()

/** The default `toMessage`: the application reduces `RemoteMessage` itself. */
export const identityMessage = (message: RemoteMessage): RemoteMessage => message

export interface RetainOptions {
  /** The query connections the application shows, by `QueryRef` or identity. */
  readonly connections?: ReadonlyArray<ConnectionIdentity> | undefined
  /** How long the roots must be stable before collecting; default none. */
  readonly grace?: Duration.Input | undefined
  /**
   * What `persistence(Data, …)` saves of what this reads: `{ maxAge }` in
   * milliseconds, measured from when it was fetched, or `false` for none of
   * it. Without it, the wiring's own `maxAge`. Where two calls that name one
   * read the same row or list, `false` wins, else the longer age.
   */
  readonly persist?: PersistOption | undefined
}

/** `Remote.retain`'s options: a retain entry wired by hand says the budget itself. */
export interface RetainEntryOptions extends RetainOptions {
  /** How many entries, rows and lists, retention keeps; `defaultBudget` when not given. */
  readonly budget?: number | undefined
  /** How long a list left is held for Back and Forward, in milliseconds; `defaultHistoryWindow` when not given. */
  readonly historyWindow?: number | undefined
}

/** The budget given, refused where it is given when it counts no entries a cache can hold. */
export const checkedBudget = (budget: number | undefined): number | undefined => {
  if (budget !== undefined && !(budget >= 0))
    throw new Error(
      `[foldkit-remote] budget is how many entries retention keeps, 0 or more (Infinity for no limit); got ${budget}`,
    )
  return budget
}

/** The history window given, refused where it is given when it is no length of time. */
export const checkedHistoryWindow = (window: number | undefined): number | undefined => {
  if (window !== undefined && !(window >= 0))
    throw new Error(
      `[foldkit-remote] historyWindow is how long a list left is held for Back and Forward, in milliseconds, 0 or more; got ${window}`,
    )
  return window
}

/**
 * `RetentionChanged` for these roots, as the retain entry sends it once they
 * have been stable for `grace`: stamped with the clock, and naming a budget
 * and a history window only when one was given.
 */
export const retentionChanged = (
  roots: RetentionRoots,
  options: {
    readonly budget: number | undefined
    readonly historyWindow: number | undefined
    readonly grace: Duration.Input | undefined
  },
): Effect.Effect<RemoteMessage> =>
  Clock.currentTimeMillis.pipe(
    Effect.delay(options.grace ?? 0),
    Effect.map((now): RemoteMessage => ({
      _tag: 'RetentionChanged',
      roots,
      now,
      ...(options.budget === undefined ? {} : { budget: options.budget }),
      ...(options.historyWindow === undefined ? {} : { historyWindow: options.historyWindow }),
    })),
  )

/**
 * A read's policy: one for every Model, or one picked from the Model (an
 * `online` field the application keeps), so a change of it restarts the read
 * entry with the plan the new policy makes.
 */
export type PolicyOption<AppModel> = RemotePolicy | ((model: AppModel) => RemotePolicy)

/** The policy `option` picks for `model`; `RemotePolicy.cacheFirst` when none was given. */
export const policyAt = <AppModel>(
  option: PolicyOption<AppModel> | undefined,
  model: AppModel,
): RemotePolicy =>
  option === undefined
    ? RemotePolicy.cacheFirst
    : typeof option === 'function'
      ? option(model)
      : option

/** How `Remote.observe` and `Remote.prefetch` treat fields the store already holds. */
export interface ObserveOptions<AppModel = never> {
  /** Default `RemotePolicy.cacheFirst`; a function picks it from the Model. */
  readonly policy?: PolicyOption<AppModel> | undefined
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
export const defineRemote = <
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
      cached: new Map(
        config.entities.flatMap(entity =>
          Option.toArray(
            Option.map(EdgeCache.policyOf(entity), policy => [entity.name, policy] as const),
          ),
        ),
      ),
    },
  }
}

/** Binds a Remote domain to its store's location in the application Model. */
export const bindRemote = <
  AppModel,
  Store extends RemoteModel,
  Entities extends readonly EntityLike[],
  Queries extends readonly QueryDescriptor<any, any, any>[],
  Mutations extends readonly MutationDescriptor<any, any, any>[],
>(
  definition: RemoteDescriptor<Entities, Queries, Mutations>,
  ref: ModelRef<AppModel, Store>,
  operators: Option.Option<MemoryOperators>,
): BoundRemote<AppModel, Store, EntityName<Entities[number]>> => {
  const store = ModelRef.focus(ref)
  const name = store.dependency.join('.') || 'remote'
  const capabilities = noCapabilities(name)
  for (const mutation of definition.mutations) mutation[Installs](capabilities)
  for (const query of definition.queries) query[Installs]?.(capabilities)
  return {
    definition,
    store,
    operators,
    [Capability]: capabilities,
    contract: {
      kind: 'remote',
      name,
      // A generated field reference knows its application and its path; a raw
      // optic (`ModelRef.fromOptic`) knows neither, so it claims nothing.
      owner: (store as { readonly owner?: object }).owner,
      owns: store.dependency.length === 0 ? [] : [store.dependency],
      observes: store.dependency.length === 0 ? [] : [store.dependency],
      messages: [],
      metadata: [],
      facts: () => domainFacts(definition.mutations),
    },
  }
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
  /**
   * Held lists among `queries` asked for again though they are held (aged,
   * or forced), which read `Refreshing` while they are.
   */
  readonly refreshing: ReadonlyArray<string>
  /** What of `requirements` is read again though held (`refreshedOf`): it reads `Refreshing` meanwhile. */
  readonly refreshes: ReadonlyArray<Requirement>
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

export const planAsked = (
  bound: BoundRemote<any, any>,
  remote: RemoteModel,
  asked: Asked,
  options: PlanOptions,
): Planned => {
  // `cacheOnly`: nothing is asked, and nothing the store holds ages out.
  if (options.unasked === true)
    return { requirements: [], queries: [], refreshing: [], refreshes: [], expires: null }
  const capabilities = bound[Capability]
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
    // A list held for the history navigation that came back to it is shown
    // as it was left, and asked for by nothing.
    const due =
      known !== undefined &&
      known.stale &&
      !heldForHistory(remote.history, remote.connections, connection.identity)
    if (!failed && (known === undefined || due || aged || options.force === true)) {
      queries.push(
        size === undefined
          ? connection
          : withWindow(
              connection,
              connection.window.first === undefined ? { last: size } : { first: size },
            ),
      )
      // A stale list is already marked, and an answer queued before the mark
      // would be made stale again: see `refreshedOf`.
      if (known !== undefined && known.segments.length > 0 && (aged || options.force === true))
        refreshing.push(connection.identity)
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
    const edges = edgesOf(capabilities, remote, connection.identity, known)
    items.push(
      ...itemsOf(
        edges.map(edge => edge.ref),
        connection.select,
      ),
    )
  }
  const visible = visibleOf(capabilities, remote, bound.operators)
  const read = [...asked.requirements, ...items]
  const held = requestOnlyOf(capabilities, remote)
  const store = plannedOf(capabilities, remote, visible)
  const planned = plan(store, read, options)
  const sent = planned.filter(
    requirement => !held.has(entityKey(requirement.entity, requirement.id)),
  )
  const rowsExpire = freshness === undefined ? undefined : deadlineOf(visible, read, freshness)
  const requirements = options.force === true ? sent : withoutFailedFields(remote, sent)
  return {
    requirements,
    queries,
    refreshing,
    refreshes: refreshedOf(store, requirements, options),
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
 *
 * A failed field a read has started since is kept: it reads `Loading`, and
 * only that read's answer settles it. An entry restarted on a Model a beat
 * behind its own answers starts such a read (its plan predates the failure
 * that lands first), and dropping the field from the next plan would
 * interrupt that read and leave the field `Loading` for good.
 */
const withoutFailedFields = (
  remote: RemoteModel,
  planned: ReadonlyArray<Requirement>,
): ReadonlyArray<Requirement> => {
  if (Object.keys(remote.failures.fields).length === 0) return planned
  return planned.flatMap(requirement => {
    const fields = requirement.fields.filter(
      field =>
        !isFieldFailed(remote, requirement.entity, requirement.id, field) ||
        remote.loading.has(fieldMark(requirement.entity, requirement.id, field)),
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
export const itemsOf = (
  edges: ReadonlyArray<{ readonly entity: string; readonly id: string }>,
  select: RelationRequirement,
): ReadonlyArray<Requirement> =>
  edges.filter(edge => edge.entity === select.entity).map(edge => ({ ...select, id: edge.id }))

export const queryRequestOf = (
  query: Parameters<typeof parsedQueryRequest>[0],
): Effect.Effect<Schema.Schema.Type<typeof QueryRequest>, RemoteQueryError> =>
  Effect.suspend(() =>
    Result.match(parsedQueryRequest(query), { onFailure: Effect.fail, onSuccess: Effect.succeed }),
  )

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

export const pageMessage = (
  connection: string,
  result: Schema.Schema.Type<typeof QueryResult>,
  refreshes = false,
  window: QueryWindow = {},
  select?: RelationRequirement | undefined,
  now?: number | undefined,
  /** The refresh generation the query was planned under: see `ConnectionMerged.generation`. */
  generation?: number | undefined,
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
      ...(generation === undefined ? {} : { generation }),
    }
  }
  const hasPayload =
    select !== undefined &&
    ((result.entities !== undefined && result.entities.length > 0) ||
      (result.settled !== undefined && result.settled.length > 0))
  // An empty page dates its list too: the age a saved list is judged by.
  const dated = hasPayload ? (now ?? 0) : now
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
      ? { entities: [...(result.entities ?? [])], settled: [...(result.settled ?? [])] }
      : {}),
    ...(dated === undefined ? {} : { now: dated }),
    ...(result.principal === undefined ? {} : { principal: madeAsOf(result.principal) }),
    ...(generation === undefined ? {} : { generation }),
  }
}

/**
 * The retention roots of some projections: their requirements, their
 * connections (each with the union of what the projections select of its
 * items), and the connections listed by identity alone.
 */
export const rootsOf = (
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
  return marked(
    {
      requirements: Requirement.merge(projections.flatMap(requirementsOf)),
      connections: [...connections.values()].sort((a, b) => (a.identity < b.identity ? -1 : 1)),
    },
    persistOf(options.persist),
  )
}

/** Reads requirements and reports the Message that settles them. Never fails. */
const readMessage = (
  requirements: ReadonlyArray<Requirement>,
  after: ReadonlyArray<Schema.Schema.Type<typeof RowToken>>,
  now: () => number,
  generation: number,
): Effect.Effect<RemoteMessage, never, RemoteClient> =>
  Effect.gen(function* () {
    const client = yield* RemoteClient
    const at = now()
    const result = yield* Effect.result(
      defectAsFailure(
        client.read({
          version: REMOTE_PROTOCOL_VERSION,
          requests: requirements,
          ...(after.length === 0 ? {} : { after }),
        }),
      ),
    )
    return Result.isFailure(result)
      ? {
          _tag: 'ReadFailed',
          requests: requirements,
          error: remoteError(result.failure),
          generation,
        }
      : {
          _tag: 'ReadReceived',
          requests: requirements,
          result: result.success,
          now: at,
          ...(after.length === 0 ? {} : { after }),
          generation,
        }
  })

/** Runs a query and reports the page that refreshes its connection, or the failure. Never fails. */
const queryMessage = (
  query: {
    readonly identity: string
    readonly window: QueryWindow
    readonly select?: RelationRequirement | undefined
  },
  now: () => number,
  generation: number,
): Effect.Effect<RemoteMessage, never, RemoteClient> =>
  Effect.gen(function* () {
    const client = yield* RemoteClient
    const result = yield* Effect.result(
      defectAsFailure(queryRequestOf(query).pipe(Effect.flatMap(request => client.query(request)))),
    )
    return Result.isFailure(result)
      ? {
          _tag: 'QueryFailed',
          connection: query.identity,
          error: remoteError(result.failure),
          generation,
        }
      : pageMessage(
          query.identity,
          result.success,
          true,
          query.window,
          query.select,
          now(),
          generation,
        )
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
  /** The read-after tokens of the rows `requirements` reads that hold one (`withTokens`). */
  readonly after: ReadonlyArray<Schema.Schema.Type<typeof RowToken>>
  readonly queries: ReadonlyArray<Schema.Schema.Type<typeof PlannedQuery>>
  /**
   * The highest generation the fields this entry reads were refreshed at: a
   * refresh of any of them restarts the entry, and a refresh of anything else
   * leaves it running.
   */
  readonly refresh: number
  /**
   * Held lists the entry queries whole though they are held (aged out, or
   * forced): under a refreshing policy its `RefreshStarted` marks them stale,
   * so each reads `Refreshing` with its rows and the page answering it
   * replaces them.
   */
  readonly refreshing: ReadonlyArray<string>
  /**
   * What of `requirements` is read again though the store holds it (aged
   * out, forced, or under another window): under a refreshing policy its
   * `RefreshStarted` marks these, and only these, stale, so each reads
   * `Refreshing`. Empty under any other policy.
   */
  readonly refreshes: ReadonlyArray<Requirement>
  /**
   * Under a refreshing policy, when a value the entry holds next ages out and
   * what is due then. Time reaches Remote only as a Message: the entry sleeps
   * until then and emits `RefreshStarted`, which marks the fields and lists
   * stale, and the plan that follows fetches them. A Model that does not
   * change past its `maxAge` is otherwise never looked at again.
   */
  readonly expires: ReadDeadline | null
  /**
   * The `loading` marks this entry set that its plan no longer asks for: the
   * read that set them was interrupted when the entry restarted (a change of
   * policy to `cacheOnly`, a row a pending write now holds), and no answer
   * will clear them. The entry's first Message takes them back.
   */
  readonly abandoned: ReadonlyArray<string>
}

/** `RefreshStarted` for these fields and lists, naming lists only when there are some. */
const refreshStarted = (
  requests: ReadonlyArray<Requirement>,
  connections: ReadonlyArray<string>,
): RemoteMessage =>
  connections.length === 0
    ? { _tag: 'RefreshStarted', requests }
    : { _tag: 'RefreshStarted', requests, connections }

/** How many read entries were made: each one's `by` is its own. */
let readEntries = 0

/**
 * The read entry: plans what `askedOf(model)` asks against the Model and runs
 * the entity read and the queries concurrently. Each Message it emits changes
 * the Model, so Foldkit recomputes the dependencies and restarts the stream
 * (`switchMap`): a merged page's items are planned by that next computation,
 * against the store as it then is, rather than read here unplanned. Nothing
 * the entry needs is spread over two Messages, since the second could be lost
 * to the restart; a page and its refresh are one `ConnectionMerged`.
 */
export const observeEntry = <AppModel, Store extends RemoteModel, Message>(
  bound: BoundRemote<AppModel, Store>,
  askedOf: (model: AppModel) => Asked,
  toMessage: (message: RemoteMessage) => Message,
  options: ObserveOptions<AppModel>,
): EntryWithoutKeepAlive<AppModel, Message, ReadDependencies, RemoteClient> => {
  const { now = wallClock, timeout } = options
  // Who set a `loading` mark, so a restart takes back its own and no other's.
  const by = `read:${++readEntries}`
  const read = (
    requirements: ReadonlyArray<Requirement>,
    after: ReadDependencies['after'],
    generation: number,
  ) =>
    Effect.map(
      withCallTimeout(readMessage(requirements, after, now, generation), timeout),
      toMessage,
    )
  const run = (query: ReadDependencies['queries'][number], generation: number) =>
    Effect.map(withCallTimeout(queryMessage(query, now, generation), timeout), toMessage)
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
      after: Schema.Array(RowToken),
      queries: Schema.Array(PlannedQuery),
      refresh: Schema.Number,
      refreshing: Schema.Array(Schema.String),
      refreshes: Schema.Array(ReadRequest),
      expires: Schema.NullOr(
        Schema.Struct({
          at: Schema.Number,
          due: Schema.Array(ReadRequest),
          connections: Schema.Array(Schema.String),
        }),
      ),
      // What the restart a plan change caused takes back, so no part of what
      // restarts the entry: taking it back must not restart it again.
      abandoned: Schema.Array(Schema.String).pipe(Schema.overrideToEquivalence(() => () => true)),
    }),
    modelToDependencies: model => {
      const policy = policyAt(options.policy, model)
      const remote = bound.store.get(model)
      const asked = askedOf(model)
      // A policy picked from the Model can change while the Remote model does not.
      const askedKey = stableStringify([policy, asked])
      const at = now()
      let byAsked = planned.get(remote)
      const known = byAsked?.get(askedKey)
      if (known !== undefined && at < known.until) return known.dependencies
      const plan = planAsked(bound, remote, asked, RemotePolicy.toPlan(policy, at))
      const { requirements, after } = withTokens(remote.entities, plan.requirements)
      const asking = new Set([
        ...requirements.flatMap(({ entity, id, fields }) =>
          fields.map(field => fieldMark(entity, id, field)),
        ),
        ...plan.queries.map(query => connectionMark(query.identity)),
      ])
      const dependencies: ReadDependencies = {
        refresh: refreshedAt(
          remote.refresh,
          requirements,
          plan.queries.map(query => query.identity),
        ),
        requirements,
        after,
        queries: plan.queries.map(({ identity, window, select }) => ({
          identity,
          window,
          select,
        })),
        refreshing: plan.refreshing,
        refreshes: RemotePolicy.refreshes(policy) ? plan.refreshes : [],
        expires: plan.expires,
        abandoned: ownedMarks(remote, by).filter(mark => !asking.has(mark)),
      }
      if (byAsked === undefined) {
        byAsked = new Map()
        planned.set(remote, byAsked)
      }
      byAsked.set(askedKey, { until: plan.expires?.at ?? Infinity, dependencies })
      return dependencies
    },
    dependenciesToStream: ({
      requirements,
      after,
      queries,
      refresh,
      refreshing,
      refreshes,
      expires,
      abandoned,
    }) =>
      Stream.concat(
        Stream.fromIterable([
          ...(abandoned.length === 0
            ? []
            : [toMessage({ _tag: 'ReadAbandoned', by, marks: abandoned })]),
          // Absent fields read as `Loading` until the read lands.
          ...(requirements.length === 0
            ? []
            : [toMessage({ _tag: 'ReadStarted', requests: requirements, refresh, by })]),
          // A refreshing policy also marks the present fields, and the held
          // lists it asks for whole, stale.
          ...(refreshes.length > 0 || refreshing.length > 0
            ? [toMessage(refreshStarted(refreshes, refreshing))]
            : []),
          // A list with nothing to show reads `Loading` until its page lands.
          ...(queries.length === 0
            ? []
            : [
                toMessage({
                  _tag: 'QueryStarted',
                  connections: queries.map(query => query.identity),
                  by,
                }),
              ]),
        ]),
        Stream.merge(
          Stream.mergeAll(
            [
              ...(requirements.length === 0
                ? []
                : [Stream.fromEffect(read(requirements, after, refresh))]),
              ...queries.map(query => Stream.fromEffect(run(query, refresh))),
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

/**
 * `resolvedOf` computed once per Model: the read, live, and retain entries
 * all derive their dependencies from the same projections on the same Model
 * change, and a Surface's `model` callback (which lifts and builds schemas)
 * need not run three times for it. Models are objects, so the memo is weak.
 */
export const memoizedResolved = <AppModel>(
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
export const refusalOf = <Refused>(
  error: RemoteError,
  mutation: MutationDescriptor<string, any, any, Refused>,
): Option.Option<Refused> =>
  error.refusal === undefined
    ? Option.none()
    : Schema.decodeUnknownOption(mutation.Refusal)(error.refusal)

/** Refuses an entry of another application: two can share a Model type, and the owner token tells them apart. */
export const assertOwnedBy = <AppModel>(contract: Contract, entry: ActiveEntry<AppModel>): void => {
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
export const isQueryRef = <AppModel>(
  target: RefreshTarget<AppModel>,
): target is QueryRef<string, any> =>
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
export const targetProjections = <AppModel>(
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

/**
 * How many rows a read of `ref` shows: its window's `first` or `last`, as
 * `Data.more` has grown it. `undefined` for a window with a cursor or no size,
 * which shows whatever the connection holds.
 */
export const windowSize = (
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
export const cutToWindow = (
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
export const deletedInWindow = (
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

/** The window keys of a `QueryOptions`, and only those, without the undefined ones. */
const pickWindow = (window: QueryWindowOptions): QueryWindow => ({
  ...(window.first === undefined ? {} : { first: window.first }),
  ...(window.last === undefined ? {} : { last: window.last }),
  ...(window.after === undefined ? {} : { after: window.after }),
  ...(window.before === undefined ? {} : { before: window.before }),
})
