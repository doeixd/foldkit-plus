/**
 * `foldkit-remote/live`: reads that watch what they read (#378). A live read
 * installs, on the domain it reads, the code that runs a live stream and
 * applies its events (and shows the rows a live insert adds), so a page that
 * reads nothing live keeps none of it. `httpWithLive` is the client whose live
 * stream these reads ask for.
 */
import { Option } from 'effect'
import type { EntryWithoutKeepAlive } from 'foldkit/subscription'
import type { Projection, Surface } from 'foldkit-surface'
import { askedOf } from './active.js'
import { Capability, type Capabilities } from './capability.js'
import type { RemoteClient } from './client.js'
import type {
  ActiveEntry,
  BoundRemote,
  EntitySelection,
  LiveDependencies,
  LiveOptions,
  ModelOfDomain,
  QueryEntity,
  QueryInput,
  QueryOptions,
  QueryProjection,
  Registered,
  RemoteDomain,
} from './index.js'
import { Remote } from './index.js'
import { innerOf } from './inner.js'
import { liveAskOf, liveEntry } from './liveEntry.js'
import { installLive } from './liveReads.js'
import { liveStreamKey } from './liveState.js'
import type { RemoteMessage, RemoteModel } from './model.js'
import type { QueryDescriptor } from './query.js'
import type { RemoteData, RemoteError } from './remoteData.js'
import { RemoteRequirements, requirementsOf } from './requirement.js'

export { httpWithLive, liveFetch, type LiveFetchOptions } from './sse.js'

type AnyDomain = RemoteDomain<any, any, any, any, any>

/** The query names a domain registers. */
type QueryNames<Domain> =
  Domain extends RemoteDomain<any, any, any, infer Queries, any>
    ? Queries[number] extends QueryDescriptor<infer Name, any, any>
      ? Name
      : never
    : never

/**
 * `Data.get`, and the projection also subscribes to the entity's changes: its
 * requirements are marked `live`, so `subscriptions` streams them for the
 * Surfaces that read it.
 */
export const live = <
  AppModel,
  Store extends RemoteModel,
  Names extends string,
  Value,
  Name extends string,
  Id extends string = string,
>(
  domain: BoundRemote<AppModel, Store, Names>,
  selection: EntitySelection<Value, Name, Id> & Registered<Name, Names, 'Entity'>,
  // The id type of the Entity selected: another Entity's branded id does not fit.
  id: NoInfer<Id>,
): Projection<AppModel, RemoteData<Value>> => {
  installLive(domain[Capability])
  const projection = Remote.select(domain, selection)(id)
  return {
    ...projection,
    metadata: RemoteRequirements.of(
      ...requirementsOf(projection).map(requirement => ({ ...requirement, live: true })),
    ),
  }
}

/**
 * `Data.query`, and the list is watched live while a Surface reads it: rows
 * that join, change or leave it are streamed (by a live source that watches
 * queries, such as `foldkit-remote-drizzle`'s `pollLive`). Needs `first`: a
 * list watched live is read again every tick.
 */
export function liveQuery<
  Domain extends AnyDomain,
  Q extends QueryDescriptor<any, any, any>,
  Value,
  Entity extends string,
>(
  domain: Domain,
  query: Q & Registered<Q['name'], QueryNames<Domain>, 'Query'>,
  input: QueryInput<Q>,
  options: QueryOptions<Value, Entity, QueryEntity<Q>> & { readonly first: number },
): QueryProjection<ModelOfDomain<Domain>, Value, Q['name'], QueryInput<Q>>
/**
 * For a package over a domain it types structurally (`foldkit-crud`'s
 * `DomainLike`), as that domain's `query` is: the Model it reads is given, and
 * the query's registration is checked where the domain was made.
 */
export function liveQuery<AppModel>(
  domain: { readonly [Capability]: Capabilities },
  query: QueryDescriptor<any, any, any>,
  input: unknown,
  options: QueryOptions<any, string, string> & { readonly first: number },
): QueryProjection<AppModel, any, string, unknown>
export function liveQuery(
  domain: { readonly [Capability]: Capabilities },
  query: QueryDescriptor<any, any, any>,
  input: unknown,
  options: QueryOptions<any, string, string> & { readonly first: number },
): QueryProjection<unknown, unknown, string, unknown> {
  installLive(domain[Capability])
  return innerOf<unknown>(domain).liveQuery(query, input, options)
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

/**
 * Whether what `active` reads live is arriving: `Reconnecting` from the moment
 * its stream breaks until it resubscribes, which its live entry does on its
 * own, with backoff.
 */
export const liveStatus = <AppModel>(
  domain: RemoteDomain<AppModel, any, any, any, any>,
  model: AppModel,
  active: ActiveEntry<AppModel>,
): LiveStatus => {
  const asked = innerOf<AppModel>(domain).liveAsk(model, active)
  if (asked.requirements.length === 0 && asked.queries.length === 0) return { _tag: 'Idle' }
  const remote: RemoteModel = domain.store.get(model)
  const stream = liveStreamKey(asked)
  const health = remote.streams[stream]
  if (health === undefined) return { _tag: 'Live' }
  return Option.match(health.refused, {
    onSome: (error): LiveStatus => ({ _tag: 'Refused', error }),
    onNone: (): LiveStatus =>
      remote.gaps.has(stream)
        ? { _tag: 'Reconnecting', attempt: health.failures, error: health.error }
        : { _tag: 'Live' },
  })
}

const identityMessage = (message: RemoteMessage): RemoteMessage => message

/**
 * A Foldkit Subscription entry that consumes the live stream for a Surface's
 * requirements, every row it reads and each list it reads live, emitting a
 * `LiveReceived` per event and a `ReadFailed` carrying its `stream` when the
 * stream breaks (including `ResumeUnavailable`). That records a gap on the
 * stream rather than a failed read, since nothing was being read, and restarts
 * the entry after a backoff; the restart refetches what it covers. The resume
 * cursor is read from `RemoteModel.live`, so the application tracks no cursor
 * of its own. `Data.subscriptions` makes these for an active record.
 */
export const observeLive = <
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
): EntryWithoutKeepAlive<AppModel, Message, LiveDependencies, RemoteClient> => {
  installLive(bound[Capability])
  return liveEntry(
    bound,
    () => {
      const projection = surface.projection(params)
      return { ...liveAskOf(askedOf(projection)), requirements: requirementsOf(projection) }
    },
    toMessage,
    options,
  )
}
