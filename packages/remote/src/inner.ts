/**
 * What the entries of their own (`foldkit-remote/why`, `/filter`, `/live`) read of a
 * bound domain that its public face does not offer. Held beside the domain
 * rather than on it, so a page that never calls them keeps none of their code.
 */
import type { ExprContext } from 'foldkit-entity'
import type {
  ActiveEntry,
  QueryInput,
  QueryOptions,
  QueryProjection,
  QueryEntity,
} from './index.js'
import type { LiveAsk } from './liveState.js'
import type { QueryDescriptor } from './query.js'
import type { Connection, Edge } from './connection.js'
import type { RemoteModel } from './model.js'
import type { WhyReader } from './whyReasons.js'

/** A bound domain's own reading, which `bindDomain` records once per domain. */
export interface Inner<AppModel> {
  /** How the domain reads its lists, as `why` explains them. */
  readonly why: (model: AppModel) => WhyReader
  /** What a list body's `Expr.viewer` reads for this Model. */
  readonly context: (model: AppModel) => ExprContext
  /** The edges a loaded list shows, as its reads draw them. */
  readonly shown: (
    remote: RemoteModel,
    identity: string,
    connection: Connection,
  ) => ReadonlyArray<Edge>
  /** A query read that watches its list live. */
  readonly liveQuery: <Q extends QueryDescriptor<any, any, any>, Value, Entity extends string>(
    query: Q,
    input: QueryInput<Q>,
    options: QueryOptions<Value, Entity, QueryEntity<Q>>,
  ) => QueryProjection<AppModel, Value, Q['name'], QueryInput<Q>>
  /** What an active entry reads live for this Model. */
  readonly liveAsk: (model: AppModel, active: ActiveEntry<AppModel>) => LiveAsk
}

const inners = new WeakMap<object, unknown>()

/** Records `domain`'s own reading. */
export const withInner = <Domain extends object, AppModel>(
  domain: Domain,
  inner: Inner<AppModel>,
): Domain => {
  inners.set(domain, inner)
  return domain
}

/** The own reading of a domain `Remote.make` bound. */
export const innerOf = <AppModel>(domain: object): Inner<AppModel> => {
  const inner = inners.get(domain)
  if (inner === undefined) throw new Error('Remote: pass a domain made by Remote.make')
  return inner as Inner<AppModel>
}
