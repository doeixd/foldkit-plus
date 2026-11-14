/**
 * The `Remote` namespace: binding a domain, and the operations over it.
 * An ES module rather than an object, so a page keeps only the members it
 * calls: one that reads keeps no transport or resume code (#396).
 */
import { Clock, Effect, Layer, Match, Option, Record, Schema, Stream } from 'effect'
import type { ExprContext, MemoryOperators } from 'foldkit-entity'
import type { RpcClientError } from 'effect/rpc'
import { mapMessage } from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import type { EntryWithoutKeepAlive } from 'foldkit/subscription'
import { Diagnostics, ModelRef, type Projection, type Surface } from 'foldkit-surface'
import { RemoteClient, liveEventOf, mutateRemote, type RemoteRpcClient } from './client.js'
import { madeAsOf } from './queue.js'
import {
  emptyConnection,
  hasNext,
  hasPrevious,
  items,
  type Connection,
  type Edge,
} from './connection.js'
import type { EntityPatch, EntityRef, PatchValues } from './entity.js'
import { wireValues } from './patchValues.js'
import { EntityChange, changesOf } from './changes.js'
import type { HeldConnection } from './impact.js'
import {
  Capability,
  Installs,
  connectionIdentity,
  edgesOf,
  goneOf,
  layersIn,
  liveIn,
  shownEdgesOf,
  visibleOf,
  type Answered,
  type Lists,
  type WriteMethods,
} from './capability.js'
import { memoRead } from './memo.js'
import { assertRegistered } from './registered.js'
import type { WhyReader } from './whyReasons.js'
import { withInner } from './inner.js'
import { liveAskOf, liveEntry } from './liveEntry.js'
import { askedOf, askedUnion, resolvedOf, type NamedProjection } from './active.js'

import { inspectEntity, inspectRemote } from './inspect.js'
import type { LiveEvent } from './liveState.js'
import {
  failureOf,
  initialRemoteModel,
  isLoadingThrough,
  windowGrowthKey,
  isQueryLoading,
  isRemoteMessage,
  dismissQueued,
  signedInQueued,
  forgetRemote,
  refreshIsInFlight,
  remoteMessageCases,
  remoteModelSchema,
  retentionRootsSchema,
  invalidateConnections,
  readsStale,
  reduceIn,
  setConnectionStale,
  withRefreshRequested,
  writeRead,
  type RemoteMessage,
  type RemoteMessageInput,
  type RemoteModel,
} from './model.js'
import {
  forgetFailure,
  mutationStatus,
  type NormalizedPatch,
  type PendingDelete,
} from './ledger.js'
import type { MutationDescriptor } from './mutationDescriptor.js'
import { plan as planRequirements, type PlanOptions } from './plan.js'
import { RemotePolicy } from './policy.js'
import { IDENTITY_SEPARATOR, queryIdentity, stableStringify } from './query.js'
import type { ConnectionSpec, QueryDescriptor, QueryRef } from './query.js'
import { remoteDataSchema, type RemoteData, type RemoteError } from './remoteData.js'
import { heldForHistory, type RetentionRoots } from './retain.js'
import { combinePersist, marked, persistOf, withPersist, type Persist } from './persist.js'
import { Selection, pageSchema, type Page } from './selection.js'
import { sameData } from './data.js'
import { recent } from './recent.js'
import { INITIAL, LOADING, failedWith, readRow } from './rowRead.js'
import { entityKey, type EntityStore } from './store.js'
import {
  QueryResult,
  REMOTE_PROTOCOL_VERSION,
  RemoteLiveError,
  RemoteForbidden,
  RemoteMutationError,
  RemoteQueryError,
  RemoteReadError,
  RemoteUnreachable,
} from './wire.js'
import { coalescedLayer, type ClientOptions } from './coalesce.js'
import {
  Requirement,
  RemoteConnections,
  connectionsOf,
  requirementsOf,
  type RelationRequirement,
} from './requirement.js'
import { markAll } from './deferrable.js'
import {
  descriptorOf,
  RemoteUnsatisfied,
  type NameOf,
  type FieldsOf,
  selectionOf,
  type EntityName,
  type QueryName,
  type MutationName,
  readContract,
  placeableReadContract,
  metaOf,
  storeOf,
  confirmed,
  selectReaders,
  selectReader,
  PAGES_KEPT,
  keptPage,
  wallClock,
  policyAt,
  type PolicyOption,
  identityMessage,
  checkedBudget,
  checkedHistoryWindow,
  retentionChanged,
  defineRemote,
  bindRemote,
  planAsked,
  itemsOf,
  queryRequestOf,
  pageMessage,
  rootsOf,
  observeEntry,
  memoizedResolved,
  refusalOf,
  assertOwnedBy,
  isQueryRef,
  targetProjections,
  windowSize,
  cutToWindow,
  deletedInWindow,
  type EntityLike,
  type EntitySelection,
  type Registered,
  type RemoteDescriptor,
  type BoundRemote,
  type ActiveEntry,
  type RemoteEntry,
  type SubscriptionEntries,
  type SubscriptionsOptions,
  type RemoteDomain,
  type RemoteFold,
  type ModelOfDomain,
  type QueryRequirement,
  type QueryOptions,
  type QueryProjection,
  type QueryInput,
  type QueryEntity,
  type ReadMeta,
  type MutateOptions,
  type RetainEntryOptions,
  type ObserveOptions,
  type SatisfyOptions,
  type ReadDependencies,
  type RefreshTarget,
  type RefreshOptions,
} from './domain.js'
import { resumePart } from './resume.js'
import { answerGaps } from './answerGaps.js'
import {
  PredictionPart,
  insertUnpredicted,
  predictionMismatch,
  verification,
  withDiagnostics,
  type PredictionMismatch,
  type VerifyPredictions,
} from './diagnostics.js'
import { reduceReporting } from './reporting.js'
import { patchedFields } from './shown.js'

import { http as httpClient, json as jsonClient } from './json.js'
import { rpcFailure, rpcProtocolHttp } from './rpc.js'

/** The submodel's schema, the same for every domain; embed it in the application Model. */
export const Model = /* @__PURE__ */ remoteModelSchema()

/** The submodel's initial value. */
export const initial = initialRemoteModel

/**
 * Remote's Message cases for `defineMessageUnion`: spread them into the
 * application's union, and reduce the ones `Remote.reduces` recognizes with
 * `RemoteDomain.reduce`.
 */
export const messages = remoteMessageCases

/** Whether a Message is one of Remote's, by tag. */
export const reduces = isRemoteMessage

/**
 * Remote's Messages as one Schema, for a wrapper variant in the
 * application's union: `GotRemoteMessage: { message: Remote.Message }`. With
 * a wrapper, `update` matches the application's union exhaustively and
 * `Remote.fold` reduces what arrives inside it.
 */
export const Message = /* @__PURE__ */ defineMessageUnion(remoteMessageCases)

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
export const fold = <Domain extends RemoteDomain<any, any, any, any, any>, ParentMessage>(
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
        domain.retry(...(args as Parameters<RemoteDomain<AppModel, any, any, any, any>['retry']>)),
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
      options?: SubscriptionsOptions<AppModel>,
    ) =>
      markAll(
        messagesAs(brandEntries(domain.subscriptions(active, options)), toParentMessage),
      ) as never,
  })
}

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
export const patch = <E extends EntityLike>(
  entity: E,
  id: string,
  values: PatchValues<FieldsOf<E>>,
): EntityPatch<NameOf<E>, FieldsOf<E>> => {
  const descriptor = descriptorOf(entity)
  return descriptor.patch(id, wireValues(descriptor, values)) as EntityPatch<NameOf<E>, FieldsOf<E>>
}

/**
 * A deletion of one entity, for a mutation's `optimistic` list or an
 * overlay: `Remote.tombstone(Post, 'p1')`. Until it settles the row reads
 * `NotFound` and leaves every list and relation, as an answer's `deleted`
 * does; a failure brings it back. Keeping it gone is the answer's to say.
 */
export const tombstone = <E extends EntityLike>(entity: E, id: string): PendingDelete => ({
  _tag: 'Delete',
  ...descriptorOf(entity).ref(id),
})

/**
 * A reference to one entity, for `ConnectionChange` and anything else that
 * names a row: `Remote.ref(Project, 'p3')`. Either kind of entity, as with
 * `Remote.patch`.
 */
export const ref = <E extends EntityLike>(
  entity: E,
  id: string,
): EntityRef<NameOf<E>, FieldsOf<E>> =>
  descriptorOf(entity).ref(id) as EntityRef<NameOf<E>, FieldsOf<E>>

/**
 * Declares a Remote domain and binds it to its place in the application Model
 * in one step; the result carries the application-facing operations. The
 * descriptor alone is `Remote.define`, the binding alone `Remote.at`.
 */
export const make = <
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
   * back to one reads `Loading`, which `why` says is `Evicted`.
   */
  readonly budget?: number | undefined
  /**
   * How long a list left stays held for Back and Forward, in milliseconds
   * (`defaultHistoryWindow`, five minutes, when not given). A history
   * navigation (`Navigated`, which `Site.routing` sends) back to it within
   * this reads it `Ready` and asks for nothing; past it, or after a
   * navigation the reader started, it is refetched. 0 holds nothing.
   */
  readonly historyWindow?: number | undefined
}): RemoteDomain<AppModel, Store, Entities, Queries, Mutations> =>
  bindDomain(defineRemote(config), config.model, {
    verifyPredictions: config.verifyPredictions,
    operators: config.operators,
    viewer: config.viewer,
    budget: config.budget,
    historyWindow: config.historyWindow,
  })

/**
 * Declares a Remote domain without binding it: its entities, queries, and
 * mutations, plus the submodel. For a domain reused across applications or
 * bound in a test; `Remote.make` is the one-step form.
 */
export const define = defineRemote

/**
 * Binds a Remote domain to its store's location in the application Model. The
 * registered entity names are carried on the returned value, so `Remote.select`
 * rejects a selection for an entity this domain never declared. `operators`
 * is the client's table, which a pending computed assignment is predicted by
 * (`Operators.kernel` when not given), as `Remote.make`'s is.
 */
export const at = <
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
  bindRemote(definition, store, Option.fromUndefinedOr(options.operators))

/**
 * The resume part for this domain, for `foldkit-ssr`'s `SSR.plan({ parts })`:
 * a server render sends what the plan's active Surfaces read from the store,
 * each connection with its boundaries and each live cursor with it, and
 * nothing else. `id` tells two domains in one application apart.
 */
export const resume = resumePart

/**
 * A Projection node that reads a `RemoteData` value out of the store. The id
 * is supplied by the caller, usually from a Surface's params. The assembled
 * value is decoded against the Selection, so malformed server data surfaces
 * as `Failed` instead of being asserted into `Value`. A present value with a
 * stale field reads as `Refreshing`: an observer is refetching it.
 */
export const select = <
  AppModel,
  Store extends RemoteModel,
  Names extends string,
  Value,
  Name extends string,
>(
  bound: BoundRemote<AppModel, Store, Names>,
  given: EntitySelection<Value, Name> & Registered<Name, Names, 'Entity'>,
): ((id: string) => Projection<AppModel, RemoteData<Value>>) => {
  let byBound = selectReaders.get(bound)
  if (byBound === undefined) {
    byBound = new WeakMap()
    selectReaders.set(bound, byBound)
  }
  const known = byBound.get(given)
  if (known !== undefined) return known as (id: string) => Projection<AppModel, RemoteData<Value>>
  const reader = selectReader(bound, selectionOf<Value, Name>(given))
  byBound.set(given, reader)
  return reader
}

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
export const meta = <AppModel, Store extends RemoteModel, Value>(
  bound: BoundRemote<AppModel, Store>,
  model: AppModel,
  projection: Projection<AppModel, Value>,
): ReadMeta => metaOf(bound, bound.store.get(model), askedOf(projection))

/**
 * The pure plan for a projection against a Model: the requirements its
 * remote store does not satisfy, under `options` (freshness, force). A
 * Surface's projection is `surface.projection(params)`.
 */
export const plan = <AppModel, Store extends RemoteModel, Value>(
  bound: BoundRemote<AppModel, Store>,
  model: AppModel,
  projection: Projection<AppModel, Value>,
  options?: PlanOptions,
): ReadonlyArray<Requirement> =>
  planAsked(bound, bound.store.get(model), askedOf(projection), options ?? {}).requirements

/**
 * The queries a projection needs run before its connections read: those the
 * Model does not hold, or holds stale (every one under `force`).
 */
export const planQueries = <AppModel, Store extends RemoteModel, Value>(
  bound: BoundRemote<AppModel, Store>,
  model: AppModel,
  projection: Projection<AppModel, Value>,
  options?: PlanOptions,
): ReadonlyArray<QueryRef<string, unknown>> =>
  planAsked(bound, bound.store.get(model), askedOf(projection), options ?? {}).queries.flatMap(
    query => (query.ref === undefined ? [] : [query.ref]),
  )

export { confirmed, storeOf }

/**
 * Executes the plan against the `RemoteClient` and returns a new store. Used
 * for SSR route prefetch, hover prefetch, and tests. Never called during render.
 * `policy` decides what a present field means (default cache-first); `now`
 * is the clock it reads, so the planner itself stays pure and time-injected.
 */
export const prefetch = /* @__PURE__ */ Effect.fn('Remote.prefetch')(function* <
  AppModel,
  Store extends RemoteModel,
  Value,
>(
  bound: BoundRemote<AppModel, Store>,
  model: AppModel,
  projection: Projection<AppModel, Value>,
  options: ObserveOptions<AppModel> = {},
) {
  const store = storeOf(bound, model)
  const { now = wallClock } = options
  const at = now()
  const missing = planRequirements(
    store,
    requirementsOf(projection),
    RemotePolicy.toPlan(policyAt(options.policy, model), at),
  )
  if (missing.length === 0) return store
  yield* Effect.annotateCurrentSpan('requirementCount', missing.length)
  const client = yield* RemoteClient
  const result = yield* client.read({ version: REMOTE_PROTOCOL_VERSION, requests: missing })
  return writeRead(store, missing, result, at)
})

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
export const refresh = <AppModel, Store extends RemoteModel>(
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
      ? bound.store.set(
          model,
          invalidateConnections(
            remote,
            [target.identity],
            'it was refreshed (Data.refresh)',
          ) as Store,
        )
      : model
  }
  const asked = askedUnion(targetProjections(bound.contract, target, model))
  const merged = Requirement.mergeConnections(asked.connections) as ReadonlyArray<QueryRequirement>
  // A loaded connection's current items are marked with the entities; its page
  // is re-run by the read entry, and new items are planned when it lands.
  const items = merged.flatMap(connection => {
    const known = remote.connections[connection.identity]
    return known === undefined
      ? []
      : itemsOf(
          edgesOf(bound[Capability], remote, connection.identity, known).map(edge => edge.ref),
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
  const requirements = planRequirements(
    visibleOf(bound[Capability], remote, bound.operators),
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
  const marked = marks.reduce<RemoteModel>(
    (current, mark) => reduceIn(bound[Capability], current, mark),
    remote,
  )
  // Fields already stale may be in a read that began before this refresh (a
  // refreshing policy marks what it refetches); unless no read has begun since
  // the last refresh, that read is restarted too.
  const inFlight = requirements.some(requirement =>
    requirement.fields.some(
      field =>
        remote.entities[entityKey(requirement.entity, requirement.id)]?.stale.has(field) === true &&
        refreshIsInFlight(remote.refresh, requirement, field),
    ),
  )
  // Marking what is already marked changes nothing, so the Model keeps its identity.
  if (marked === remote && !inFlight) return model
  const refresh = withRefreshRequested(marked.refresh, requirements, invalidated)
  return bound.store.set(model, { ...marked, refresh } as Store)
}

/**
 * Forgets everything the server told this Model: values, tombstones,
 * unavailable fields, connections, live cursors, failures. What is known is
 * known for a principal, and this is the one boundary for a login, a logout
 * or a switch of organization: called from `update`, it performs no I/O, and
 * every active Surface's read and live entries restart, so the screen asks
 * again as whoever the client now is. A read or stream begun before is
 * interrupted, and an answer it had already sent writes nothing (#484). A
 * mutation in flight is treated as applied: its answer writes nothing here.
 */
export const forget = <AppModel, Store extends RemoteModel>(
  bound: BoundRemote<AppModel, Store>,
  model: AppModel,
): AppModel => bound.store.set(model, forgetRemote(bound.store.get(model)) as Store)

export { writeRead }

/**
 * Remote's client over any way of sending one JSON request and receiving its
 * answer, for `clientLayer`: a worker, a server in the page. `RemoteServer.answer`
 * is the other end.
 */
export const json = jsonClient

/**
 * Remote's client over HTTP, for `clientLayer`: each call a `POST` of the JSON
 * request to `url`. `headers` is read per request (a session token, say).
 */
export const http = httpClient

export { rpcProtocolHttp }

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
export const clientLayer = <R = never>(
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
  )

/**
 * Wraps a `RemoteClient` layer so its reads coalesce: requirements issued
 * together become one batch, cut to the server's limits, a requirement
 * already in flight is joined, and one nobody waits on is interrupted;
 * every call is held to `timeout`. `Remote.clientLayer` applies this; use
 * it on a hand-written client.
 */
export const coalesced = coalescedLayer

/**
 * A Foldkit Subscription entry that keeps the cache to what the active
 * Surfaces reach. `projections` are the ones the application observes (the
 * same it passes to `Remote.observe`), `connections` the query connections
 * it shows; anything else is collected once the roots have been stable for
 * `grace`, so a route transition that comes straight back does not thrash.
 */
export const retain = <AppModel, Message = RemoteMessage>(
  projections: ReadonlyArray<Projection<AppModel, unknown>>,
  toMessage: (message: RemoteMessage) => Message = identityMessage as never,
  options: RetainEntryOptions = {},
): EntryWithoutKeepAlive<AppModel, Message, RetentionRoots, never> => {
  const roots = rootsOf(projections, options)
  const changed = {
    budget: checkedBudget(options.budget),
    historyWindow: checkedHistoryWindow(options.historyWindow),
    grace: options.grace,
  }
  return {
    dependenciesSchema: retentionRootsSchema,
    modelToDependencies: () => roots,
    dependenciesToStream: current =>
      Stream.fromEffect(Effect.map(retentionChanged(current, changed), toMessage)),
  }
}

/**
 * Runs a `Query` through `RemoteClient`, encoding its input from the ref.
 * Pair the result with `Remote.queryMessage` to merge the page into the Model.
 * With `select`, the server also returns the selected fields of the page's
 * items, so one response populates both the connection and the store.
 */
export const query = /* @__PURE__ */ Effect.fn('Remote.query')(function* <
  Name extends string,
  Input,
>(ref: QueryRef<Name, Input>, select?: RelationRequirement | undefined) {
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
})

/** The `RemoteMessage` that merges a query page into its connection. */
export const queryMessage = <Name extends string, Input>(
  ref: QueryRef<Name, Input>,
  result: Schema.Schema.Type<typeof QueryResult>,
  select?: RelationRequirement | undefined,
  now?: number | undefined,
): RemoteMessage => pageMessage(ref.identity, result, false, ref.window, select, now)

/** A pure, serializable view of the whole cache. */
export const inspect = inspectRemote

export { inspectEntity }

/**
 * Runs a mutation through `RemoteClient`, decoding its typed Output and
 * returning the result's normalized patches so the caller can reconcile them
 * through `updateRemote`'s `MutationSucceeded` (or `Remote.mutateInto`).
 */
export const mutate = mutateRemote

/**
 * Reads the clock where the reader acts, for `Data.mutate`'s `now`: a
 * Command that yields `toMessage(now)`, the time in milliseconds since the
 * epoch. It reads Effect's `Clock`, so a test pins it, and `Trace.run`
 * runs it at the trace's time. Chirp's compose box answers a submit with
 * `Remote.now(now => Message.ClockedPost({ post, now }))`, and
 * `ClockedPost` starts the write.
 */
export const now = <M>(
  toMessage: (now: number) => M,
): { readonly name: 'Remote.now'; readonly effect: Effect.Effect<M> } => ({
  name: 'Remote.now',
  effect: Effect.map(Clock.currentTimeMillis, toMessage),
})

/**
 * Runs a mutation and reconciles its patches into a `RemoteModel` in one step,
 * returning the new model alongside the typed Output. The model-level form of
 * `MutationStarted` → `RemoteClient.mutate` → `MutationSucceeded`; in an
 * application the three are `update` (with `optimistic`), a Command, and the
 * Message the Command returns, so the optimistic operations show meanwhile.
 */
export const mutateInto = /* @__PURE__ */ Effect.fn('Remote.mutateInto')(function* <
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
  const capabilities = bound[Capability]
  mutation[Installs](capabilities)
  const started = reduceIn(capabilities, bound.store.get(model), {
    _tag: 'MutationStarted',
    requestId,
    ...(options.optimistic === undefined ? {} : { optimistic: options.optimistic }),
  })
  const outcome = yield* mutateRemote(mutation, input, requestId, { now: options.now })
  const settled = reduceIn(capabilities, started, {
    _tag: 'MutationSucceeded',
    requestId,
    entities: outcome.entities,
    connections: outcome.connections,
    deleted: outcome.deleted,
    ...(outcome.principal === undefined
      ? {}
      : { principal: madeAsOf(outcome.principal), generation: started.refresh.floor }),
    now: yield* Clock.currentTimeMillis,
  })
  return {
    output: outcome.output,
    model: bound.store.set(model, settled as Store),
  }
})

/**
 * A Foldkit Subscription entry that plans a Surface's missing fields from the
 * Model and fetches them through `RemoteClient`, emitting a `RemoteMessage`
 * per outcome. Wrap it in an application Message (`toMessage`) and reduce it
 * with the domain's `update`. Under a refreshing `policy` the entry first
 * emits `RefreshStarted`, so the fields being refetched read as `Refreshing`
 * while the request is pending.
 */
export const observe = <
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
  options: ObserveOptions<AppModel> = {},
): EntryWithoutKeepAlive<AppModel, Message, ReadDependencies, RemoteClient> =>
  observeEntry(bound, () => askedOf(surface.projection(params)), toMessage, options)

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

/**
 * The `mutate` and `retry` of a domain that registers no mutation, reachable
 * only past its types, where `Registered` refuses every mutation.
 */
const noWrites = <AppModel>(domain: string): WriteMethods<AppModel> => {
  const refused = (member: string) => (): never => {
    throw new Error(
      `Remote: domain "${domain}" declares no mutations, so it has no ${member}; register the mutation with Remote.make`,
    )
  }
  return { mutate: refused('mutate'), retry: refused('retry') }
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
  ref: ModelRef<AppModel, Store>,
  options: {
    readonly verifyPredictions?: boolean | VerifyPredictions | undefined
    readonly operators?: MemoryOperators | undefined
    readonly viewer?:
      | ((model: AppModel) => Option.Option<{ readonly entity: string; readonly id: string }>)
      | undefined
    readonly budget?: number | undefined
    readonly historyWindow?: number | undefined
  } = {},
): RemoteDomain<AppModel, Store, Entities, Queries, Mutations> => {
  const operators = Option.fromUndefinedOr(options.operators)
  const budget = checkedBudget(options.budget)
  const historyWindow = checkedHistoryWindow(options.historyWindow)
  const bound = bindRemote(definition, ref, operators)
  const capabilities = bound[Capability]
  const verify = verification(options.verifyPredictions, {
    mutations: new Set(definition.registry.mutations.keys()),
    queries: new Set(definition.registry.queries.keys()),
  })
  const store = bound.store
  // Each list's last page, so a page whose rows are the objects they were is
  // the object it was: its memo above is per store, and a write makes a store.
  const pages = recent<string, RemoteData<Page<unknown>>>(PAGES_KEPT)
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
  // The policy of each call naming a reader, `undefined` for the default.
  // A reader's policies by the key it has in a call's record, `undefined` for
  // the default: the key names its Subscription entries (`${key}.read`), so a
  // call wiring it again under that key replaces its policy, as the runtime
  // keeps one entry by that name.
  const policies = new Map<
    ActiveEntry<AppModel>,
    ReadonlyMap<string, PolicyOption<AppModel> | undefined>
  >()
  // Whether every call naming a reader reads it under `tag` for this Model.
  const readsUnder = (
    entry: ActiveEntry<AppModel>,
    model: AppModel,
    tag: RemotePolicy['_tag'],
  ): boolean =>
    policies.has(entry) &&
    [...policies.get(entry)!.values()].every(policy => policyAt(policy, model)._tag === tag)
  // What the calls naming a reader say of saving what it reads (`persist`).
  const persisting = new Map<ActiveEntry<AppModel>, Persist>()
  // The lists a call keeps by name, marked with what it says of saving them.
  const persistedLists: Array<RetentionRoots> = []
  // An application-union case has the runtime shape of the `RemoteMessage` it names.
  const reduce = (model: AppModel, message: RemoteMessage | RemoteMessageInput): AppModel => {
    const live = Match.value(message).pipe(
      Match.tag(
        'LiveReceived',
        received => received as Extract<RemoteMessage, { _tag: 'LiveReceived' }>,
      ),
      Match.orElse(() => undefined),
    )
    // A caller that said what it wanted keeps it; `updateRemote` on its own is
    // unchanged, so the pure reducer stays testable without a registry.
    const remote = store.get(model)
    const resolved =
      live === undefined || live.policy !== undefined
        ? message
        : {
            ...live,
            policy: liveIn(capabilities).policy(
              lists,
              visibleOf(capabilities, remote, operators),
              live.event,
              contextOf(model),
            ),
          }
    const reduced = reduceIn(capabilities, remote, resolved as RemoteMessage)
    const answer = Match.value(message).pipe(
      Match.tag(
        'MutationSucceeded',
        succeeded => succeeded as Extract<RemoteMessage, { _tag: 'MutationSucceeded' }>,
      ),
      Match.orElse(() => undefined),
    )
    // A repeated answer finds every value it carries already held, so it
    // changes nothing and invalidates nothing.
    const next =
      answer === undefined
        ? placedNews(reduced, newsOf(message), remote.entities, contextOf(model))
        : remote.mutations.applied.has(answer.requestId)
          ? impactOf(reduced, answer, remote.entities, contextOf(model))
          : withAnswerLists(
              remote,
              impactOf(reduced, withAnswerRead(answer), remote.entities, contextOf(model)),
              answer,
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
        visibleOf(capabilities, after, operators),
        planAsked(bound, unverified(after), askedUnion(projections), {}).requirements,
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
    const shown = visibleOf(capabilities, before, operators)
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
  const lists: Lists = { queryOf, operators }
  /** The edges a loaded list shows, its pending edits and inserts placed. */
  const shownEdges = (
    remote: RemoteModel,
    identity: string,
    connection: Connection,
  ): ReadonlyArray<Edge> => shownEdgesOf(capabilities, lists, remote, identity, connection)

  /**
   * The loaded lists with what the server said of rows they hold placed, by
   * their bodies (the body capability): a list with no body places nothing.
   */
  const placedNews = (
    remote: RemoteModel,
    news: ReadonlyArray<NormalizedPatch>,
    before: EntityStore,
    context: ExprContext,
  ): RemoteModel =>
    news.length === 0 || Option.isNone(capabilities.bodies)
      ? remote
      : withPlacements(
          remote,
          capabilities.bodies.value.news(lists, remote, news, before, context),
          new Map(),
        )

  /** The rows a read or a live patch says the server holds now. */
  const newsOf = (message: RemoteMessage | RemoteMessageInput): ReadonlyArray<NormalizedPatch> => {
    if (message._tag === 'ReadReceived') return message.result.entities
    if (message._tag !== 'LiveReceived') return []
    const event = message.event as LiveEvent
    if (event._tag !== 'EntityPatched') return []
    const { ref, values } = event
    return [{ entity: ref.entity, id: ref.id, values }]
  }

  /**
   * The loaded connections as a write left them: each judged by its body (the
   * body capability), a change it can place placed in its pages, and one it
   * cannot invalidated for its read entry to fetch. A domain whose lists have
   * no body installed none: a list over an entity the answer changed is then
   * fetched again, as one with no body always is.
   */
  const impactOf = (
    remote: RemoteModel,
    answer: Answered,
    // The store before the answer, to tell a value it changed from one it repeated.
    before: EntityStore,
    context: ExprContext,
  ): RemoteModel => {
    if (Option.isSome(capabilities.bodies)) {
      const { placed, invalidated } = capabilities.bodies.value.answer(
        capabilities,
        lists,
        remote,
        answer,
        before,
        context,
      )
      return withPlacements(remote, placed, invalidated)
    }
    return invalidateConnections(
      remote,
      unplaceable(remote, answer, before),
      'a write changed a row of its Entity, and no list declares a body for the client to place it by',
    )
  }

  /**
   * `judged` with the pages the answer carries (`lists`) written in: each list
   * the answer moved (placed, or left to be fetched again) takes its page here,
   * as its refetch would, so it reads `Ready` with no `Refreshing` between. A
   * list it did not move keeps what it holds, and one stale before it keeps
   * its own read; one with no page, or a page past its window, is fetched as
   * before.
   */
  const withAnswerLists = (
    before: RemoteModel,
    judged: RemoteModel,
    answer: Extract<RemoteMessage, { readonly _tag: 'MutationSucceeded' }>,
  ): RemoteModel => {
    let next = judged
    for (const { request, result } of answer.lists ?? []) {
      const identity = queryIdentity(request.query, request.input)
      const held = before.connections[identity]
      if (held === undefined || held.stale || judged.connections[identity] === held) continue
      const page = pageMessage(identity, result, true, request.window, request.select, answer.now)
      if (page._tag !== 'ConnectionMerged') continue
      // Marked stale first, so the page replaces what the client placed rather than merging into it.
      const owed = { ...next, connections: setConnectionStale(next.connections, identity, true) }
      next = reduceIn(capabilities, owed, page)
    }
    return next
  }

  /**
   * The lists a write's answer leaves to be fetched when no list has a body:
   * each over an entity a row of which the answer changed, unless the answer
   * itself put that row in or took it out of the list.
   */
  const unplaceable = (
    remote: RemoteModel,
    answer: Answered,
    before: EntityStore,
  ): ReadonlyArray<string> => {
    const changed = changesOf(answer, before).flatMap(change =>
      EntityChange.match(change, { Changed: () => [change], Deleted: () => [] }),
    )
    if (changed.length === 0) return []
    return Object.keys(remote.connections).filter(identity => {
      const named = new Set(
        (answer.connections ?? [])
          .filter(change => change.connection === identity)
          .map(change => change.edge.key),
      )
      return Option.match(queryOf(identity), {
        onNone: () => false,
        onSome: ({ descriptor }) => {
          const over = (descriptor.Result as Partial<ConnectionSpec>).entity
          return changed.some(
            change => change.entity === over && !named.has(entityKey(change.entity, change.id)),
          )
        },
      })
    })
  }

  /**
   * The lists placed and invalidated. Under `verifyPredictions`, each placed
   * list is fetched too, and the order it was placed in kept to compare with
   * the server's page.
   */
  const withPlacements = (
    remote: RemoteModel,
    placed: Readonly<Record<string, Connection>>,
    invalidated: ReadonlyMap<string, string>,
  ): RemoteModel => {
    const because = (identity: string) =>
      invalidated.get(identity) ?? 'its placement is checked against the server (verifyPredictions)'
    const lists = [...invalidated.keys()]
    if (Object.keys(placed).length === 0) return invalidateConnections(remote, lists, because)
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
    if (identities.length === 0) return invalidateConnections(withPlaced, lists, because)
    const firstPage = (connection: Connection | undefined) =>
      (connection?.segments[0]?.edges ?? []).map(edge => edge.key)
    // Each checked list is made stale so its page is fetched; one stale for
    // that alone reads as fresh, as without the check (`readsStale`).
    const marked = invalidateConnections(withPlaced, [...lists, ...identities], because)
    const invalidatedAnyway = new Set(lists)
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
    projections: ReadonlyArray<Projection<AppModel, unknown>>,
    options: ObserveOptions<AppModel>,
    heard: Array<RemoteMessage>,
  ) => {
    const hear = (current: AppModel, message: RemoteMessage): AppModel => {
      heard.push(message)
      return reduce(current, message)
    }
    return Effect.gen(function* () {
      const { now = wallClock } = options
      const client = yield* RemoteClient
      const planOptions = RemotePolicy.toPlan(policyAt(options.policy, model), now())
      // Asked under the Model it started from: one that lands after a
      // `forget` is the previous principal's, and writes nothing (#484).
      const generation = store.get(model).refresh.generation
      let current = model
      // The pages first, so their items join the one entity read below. A
      // page with a payload already writes its items' selected fields, so
      // the read below is only for what the server left out.
      for (const query of planAsked(bound, store.get(current), askedUnion(projections), planOptions)
        .queries) {
        const page = yield* queryRequestOf(query).pipe(
          Effect.flatMap(request => client.query(request)),
        )
        current = hear(
          current,
          pageMessage(query.identity, page, true, query.window, query.select, now(), generation),
        )
      }
      const requirements = planAsked(
        bound,
        store.get(current),
        askedUnion(projections),
        planOptions,
      ).requirements
      if (requirements.length === 0) return current
      const at = now()
      const result = yield* client.read({
        version: REMOTE_PROTOCOL_VERSION,
        requests: requirements,
      })
      return hear(current, {
        _tag: 'ReadReceived',
        requests: requirements,
        result,
        now: at,
        generation,
      })
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
        const planned = planAsked(bound, store.get(current), askedUnion(projections), planOptions)
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
        // Every Surface's reads for the pass go out as one read, planned over
        // the Model the pass began with: what a Surface reveals is read in the
        // next pass, a family's instances after its parent included.
        current = yield* prefetchInto(
          current,
          entries.flatMap(entry => resolvedOf(entry, current).map(({ projection }) => projection)),
          { now },
          heard,
        )
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
  // The write capability a registered Mutation installed, or a stub that says there is none.
  const writes: WriteMethods<AppModel> = Option.match(capabilities.writes, {
    onNone: () => noWrites(bound.contract.name),
    onSome: capability =>
      capability.bind({
        bound,
        viewerOf,
        readers: () => readers.values(),
        registeredMutation,
        judged: (model, remote, answered) =>
          impactOf(remote, answered, remote.entities, contextOf(model)),
        refetched: (remote, asked) => planAsked(bound, remote, asked, {}).queries,
      }),
  })
  // Under `verifyPredictions`, each list's members a declared insert of its Entity cannot
  // show pending (#342), once per list, insert and members.
  const unpredictedReported = new Set<string>()
  const reportUnpredicted = (query: string, select: Selection<unknown>): void => {
    if (Option.isNone(capabilities.writes)) return
    for (const mutation of definition.registry.mutations.values()) {
      if (mutation.write?.input.entity.name !== select.entity) continue
      const members = capabilities.writes.value.unpredicted(mutation.write, select.fields)
      const key = JSON.stringify([query, mutation.name, members])
      if (members.length === 0 || unpredictedReported.has(key)) continue
      unpredictedReported.add(key)
      Effect.runSync(
        Diagnostics.report(
          insertUnpredicted({ query, mutation: mutation.name, entity: select.entity, members }),
        ),
      )
    }
  }
  /** A query read; `live` watches the list too (`liveQuery` from `foldkit-remote/live`). */
  const queryRead = <Q extends QueryDescriptor<any, any, any>, Value, Entity extends string>(
    query: Q,
    input: QueryInput<Q>,
    options: QueryOptions<Value, Entity, QueryEntity<Q>>,
    live: boolean,
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
    if (live && window.first === undefined) {
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
    if (verify.on) reportUnpredicted(query.name, select)
    const contract = placeableReadContract(
      capabilities,
      readContract(query.ref(input), select, window),
      query.body,
      operators,
    )
    const { ref, relation } = contract
    const requirement = live ? { ...contract.requirement, live } : contract.requirement
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
          return LOADING
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
      const visible = visibleOf(capabilities, remote, operators)
      // Whether a history navigation holds it is no part of the connection.
      const held = heldForHistory(remote.history, remote.connections, ref.identity)
      const key = `${ref.identity}\u0000${relationKey}\u0000${String(sizeOf(remote))}\u0000${held}`
      const read = memoRead<RemoteData<Page<Value>> | undefined>(
        [visible, connection, remote.optimistic.overlays, remote.placed],
        key,
        () => {
          const made = pageOf(remote, connection, visible)
          return made === undefined ? undefined : keptPage(pages, key, made)
        },
      )
      // The page read last, a memo hit included, is what the next store's
      // page is compared with.
      if (read !== undefined) pages.set(key, read as RemoteData<Page<unknown>>)
      return read
    }
    const pageOf = (
      remote: RemoteModel,
      connection: Connection,
      visible: EntityStore,
    ): RemoteData<Page<Value>> | undefined => {
      const rows: Value[] = []
      let refreshing = readsStale(remote, ref.identity)
      let missing = false
      const { edges, cutBefore, cutAfter } = shown(remote, connection)
      for (const edge of edges) {
        const key = entityKey(edge.ref.entity, edge.ref.id)
        const row = readRow(visible, key, relation, relationKey, select.schema)
        if (row === undefined) {
          missing = true
          continue
        }
        if (row._tag === 'Failed') return row
        refreshing ||= row._tag === 'Refreshing'
        rows.push(row.value)
      }
      if (
        missing &&
        rows.length === 0 &&
        !deletedInWindow(
          items(connection),
          new Set(shownEdges(remote, ref.identity, connection).map(edge => edge.key)),
          ref.window,
          sizeOf(remote),
          goneOf(capabilities, remote),
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
          if (isQueryLoading(remote, ref.identity)) return LOADING
          return failure === undefined ? INITIAL : { _tag: 'Failed', error: failure }
        }
        // A query that answered is not the whole of a list: its rows' fields
        // are read separately, and one of those failing is the list's failure.
        const read =
          readPage(remote, connection) ??
          failedItem(remote, connection) ??
          loadingItem(remote, connection) ??
          INITIAL
        if (failure === undefined) {
          if (read._tag !== 'Ready' && read._tag !== 'Refreshing') return read
          const item = failedItem(remote, connection)
          return item === undefined ? read : failedWith(read, item.error)
        }
        // The rows held before the failure are still the best there is, so they
        // go with it as `previous`, which `RemoteData.render` shows as stale.
        switch (read._tag) {
          case 'Ready':
          case 'Refreshing':
            return failedWith(read, failure)
          case 'Failed':
            return read
          case 'Initial':
          case 'Loading':
          case 'NotFound':
            return { _tag: 'Failed', error: failure }
        }
      },
    }
  }
  const domain: RemoteDomain<AppModel, Store, Entities, Queries, Mutations> = {
    ...definition,
    ...bound,
    get: (selection, id) => select(bound, selection)(id),
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
      const persist = persistOf(options.persist)
      for (const [key, entry] of Object.entries(active)) {
        const resolvedAt = readers.get(entry) ?? memoizedResolved(entry)
        readers.set(entry, resolvedAt)
        if (persist !== undefined)
          persisting.set(entry, combinePersist(persisting.get(entry), persist))
        policies.set(entry, new Map(policies.get(entry)).set(key, options.policy))
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
      if (persist !== undefined && options.connections !== undefined)
        persistedLists.push(marked(rootsOf([], { connections: options.connections }), persist))
      entries.retain = {
        dependenciesSchema: retentionRootsSchema,
        modelToDependencies: model => {
          const unaged = new Set<string>()
          const said: Array<RetentionRoots> = [...persistedLists]
          const projections = [...readers].flatMap(([entry, resolvedAt]) => {
            const read = resolvedAt(model).map(({ projection }) => projection)
            // A list only readers that age it read keeps its age once left,
            // rather than going stale.
            if (!readsUnder(entry, model, 'StaleWhileRevalidate'))
              for (const { identity } of read.flatMap(connectionsOf)) unaged.add(identity)
            const persist = persisting.get(entry)
            if (persist !== undefined) said.push(marked(rootsOf(read, {}), persist))
            return read
          })
          const roots = withPersist(
            rootsOf(projections, { connections: [...keptConnections] }),
            said,
          )
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
            retentionChanged(current, { budget, historyWindow, grace: options.grace }),
          ),
      }
      markAll(entries)
      // The loop above wrote exactly the keys the mapped type names.
      return entries as SubscriptionEntries<AppModel, typeof active>
    },
    plan: (model, projection, options) => plan(bound, model, projection, options),
    meta: (model, projection) => meta(bound, model, projection),
    storeOf: model => storeOf(bound, model),
    confirmed: projection => confirmed(bound, projection),
    prefetch: (model, projection, options = {}) => prefetchInto(model, [projection], options, []),
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
    query: (query, input, options) => queryRead(query, input, options, false),
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
              reduceIn(capabilities, remote, {
                _tag: 'WindowGrown',
                window: windowGrowthKey(ref.identity, stableStringify(ref.window)),
                size: size + page,
              }) as Store,
            ),
          )
        : Option.none()
    },
    refresh: (model, target, options) => refresh(bound, model, target, options),
    forget: model => forget(bound, model),
    visibleItems: (remote, connection) => {
      const identity = connectionIdentity(connection)
      return shownEdges(remote, identity, remote.connections[identity] ?? emptyConnection)
    },
    ...writes,
    can: (model, mutation, input) => {
      assertRegistered(bound, 'Mutation', definition.registry.mutations, mutation.name)
      if (mutation.write === undefined)
        throw new Error(
          `[foldkit-remote] Data.can(${mutation.name}): the mutation was not declared as a Write, so the client cannot tell what it would refuse`,
        )
      if (Option.isNone(capabilities.writes))
        throw new Error(
          `[foldkit-remote] Data.can(${mutation.name}): the domain registers no Mutation`,
        )
      return capabilities.writes.value.can(
        mutation.write,
        input,
        contextOf(model),
        visibleOf(capabilities, store.get(model), operators),
        operators,
      )
    },
    mutation: (model, requestId) => mutationStatus(store.get(model).mutations, requestId),
    refusal: (model, requestId, mutation) => {
      const status = mutationStatus(store.get(model).mutations, requestId)
      return Match.valueTags(status, {
        Failed: ({ error }) => refusalOf(error, mutation),
        Unknown: () => Option.none(),
        Pending: () => Option.none(),
        Applied: () => Option.none(),
      })
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
    dismiss: (model, requestId) => {
      const remote = store.get(model)
      const dismissed = dismissQueued(remote, requestId)
      if (dismissed !== remote) return store.set(model, dismissed as Store)
      const status = mutationStatus(remote.mutations, requestId)
      if (status._tag !== 'Failed') return model
      const forgotten = { ...remote, mutations: forgetFailure(remote.mutations, requestId) }
      return store.set(model, forgotten as Store)
    },
    signedIn: model => {
      const remote = store.get(model)
      const resumed = signedInQueued(remote)
      return resumed === remote ? model : store.set(model, resumed as Store)
    },
    reduce,
    inspect: model => inspectRemote(store.get(model)),
    verifiesPredictions: verify.on,
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
  // What `foldkit-remote/why` reads of this domain: its lists as reads show them.
  const whyReader = (model: AppModel): WhyReader => {
    const remote = store.get(model)
    return {
      remote,
      visible: visibleOf(capabilities, remote, operators),
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
      context:
        remote.optimistic.layers.length === 0
          ? undefined
          : layersIn(capabilities).context(remote.optimistic.layers),
    }
  }
  return withInner(domain, {
    why: whyReader,
    unasked: (model, entry) => readsUnder(entry, model, 'CacheOnly'),
    context: contextOf,
    shown: shownEdges,
    liveQuery: (query, input, options) => queryRead(query, input, options, true),
    liveAsk: (model, active) => {
      assertOwned(active)
      const resolvedAt = readers.get(active) ?? memoizedResolved(active)
      return liveAskOf(askedUnion(resolvedAt(model).map(({ projection }) => projection)))
    },
  })
}
