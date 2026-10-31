/**
 * What a read-only domain does without (#378): the code that shows pending
 * layers and overlays. A domain holds it in a slot that stays empty until
 * something that makes a layer installs it — a Mutation the domain registers,
 * `overlay` from `foldkit-remote/overlay`, or a live insert — so a page that
 * never makes one never loads it. While the Model holds no layer the read core
 * reads the committed store directly, which is what the visible store is then.
 */
import { Option, type Stream } from 'effect'
import type { AnyQuery, ExprContext, EntityRef, MemoryOperators } from 'foldkit-entity'
import type { RemoteClient } from './client.js'
import { items, type Connection, type Edge } from './connection.js'
import type { NamedProjection } from './active.js'
import type { HeldConnection } from './impact.js'
import type {
  BoundRemote,
  DomainMutateOptions,
  LiveDependencies,
  LiveOptions,
  MutationStarted,
} from './index.js'
import type { applyConnectionEvent, applyEntityEvent } from './liveEvents.js'
import type { LiveEvent } from './liveState.js'
import type { MutationDescriptor } from './mutationDescriptor.js'
import type { MutationAnswer, MutationState, NormalizedPatch } from './ledger.js'
import type { RemoteMessage, RemoteModel } from './model.js'
import type {
  ConnectionChange,
  ConnectionOverlay,
  EntityLayer,
  OptimisticOperation,
  OptimisticState,
} from './optimistic.js'
import type { LivePolicy } from './query.js'
import { entityKey, isTombstone, type EntityKey, type EntityStore } from './store.js'

/** Where a bound domain holds what its declarations installed. */
export const Capability: unique symbol = Symbol.for('foldkit-remote/Capability')

/** The code a domain's declarations installed, by what it does. */
export interface Capabilities {
  /** The domain's name, for the defect a missing capability is. */
  readonly domain: string
  /** Shows pending layers and overlays; installed by whatever makes one. */
  layers: Option.Option<LayerCapability>
  /** `mutate` and `retry`; installed by a Mutation the domain registers. */
  writes: Option.Option<WriteCapability>
  /** Live streams and their events; installed by a live read (`foldkit-remote/live`). */
  live: Option.Option<LiveCapability>
  /** What a list's body does on the client; installed by a query declared with a body (`Query.define`). */
  bodies: Option.Option<BodyCapability>
}

export const noCapabilities = (domain: string): Capabilities => ({
  domain,
  layers: Option.none(),
  writes: Option.none(),
  live: Option.none(),
  bodies: Option.none(),
})

/** Where a declaration holds what it installs on a domain that registers it. */
export const Installs: unique symbol = Symbol.for('foldkit-remote/Installs')

/** What a declaration installs on a domain that registers it, as `Remote.make` binds it. */
export type Install = (capabilities: Capabilities) => void

/** The registered query a connection identity names, as placing a row in it needs it. */
export type ListQuery = Pick<HeldConnection, 'descriptor' | 'encoded' | 'filtered'>

/** How a domain reads its lists' bodies, for the code that places rows in them. */
export interface Lists {
  readonly queryOf: (identity: string) => Option.Option<ListQuery>
  readonly operators: MemoryOperators
}

/** The layer capability: what shows pending layers and overlays, and keeps them. */
export interface LayerCapability {
  /** The committed store with every layer applied. */
  readonly visible: (
    entities: EntityStore,
    optimistic: OptimisticState,
    operators: MemoryOperators,
  ) => EntityStore
  /** The store a read plans over (`plannedStore`). */
  readonly planned: (
    entities: EntityStore,
    optimistic: OptimisticState,
    visible: EntityStore,
  ) => EntityStore
  /** The rows only a pending request holds, which no read asks for. */
  readonly requestOnly: (
    entities: EntityStore,
    optimistic: OptimisticState,
  ) => ReadonlySet<EntityKey>
  /** Whether a list hides a row: deleted, or deleted by a pending layer. */
  readonly gone: (entities: EntityStore, optimistic: OptimisticState) => (key: EntityKey) => boolean
  /** A list's edges with its overlays merged, unplaced. */
  readonly edges: (
    entities: EntityStore,
    optimistic: OptimisticState,
    identity: string,
    connection: Connection,
  ) => ReadonlyArray<Edge>
  /** A list's edges as a read shows them: pending edits and inserts placed by its body. */
  readonly shown: (
    lists: Lists,
    entities: EntityStore,
    optimistic: OptimisticState,
    identity: string,
    connection: Connection,
  ) => ReadonlyArray<Edge>
  /** What a list body's context reads while pending layers are placed. */
  readonly context: (layers: ReadonlyArray<EntityLayer>) => ExprContext | undefined
  readonly begin: (
    optimistic: OptimisticState,
    requestId: string,
    operations: ReadonlyArray<OptimisticOperation>,
    viewer?: Option.Option<EntityRef>,
  ) => OptimisticState
  readonly settleSuccess: (
    base: EntityStore,
    optimistic: OptimisticState,
    state: MutationState,
    requestId: string,
    answer: MutationAnswer & {
      readonly connections?: ReadonlyArray<ConnectionChange> | undefined
    },
  ) => {
    readonly store: EntityStore
    readonly state: MutationState
    readonly optimistic: OptimisticState
  }
  readonly settleFailure: (optimistic: OptimisticState, requestId: string) => OptimisticState
  readonly pruneOverlays: (
    optimistic: OptimisticState,
    connection: string,
    covered: ReadonlySet<string>,
    pending: ReadonlySet<string>,
  ) => OptimisticState
}

/** What the write capability reads of the domain it is bound to. */
export interface WriteContext<AppModel, Store extends RemoteModel> {
  readonly bound: BoundRemote<AppModel, Store>
  /** Who reads, whom a declared write predicts each `Derived.exists` for. */
  readonly viewerOf: (model: AppModel) => Option.Option<EntityRef>
  /** How each reader `subscriptions` names resolves for a Model: what an answer must carry. */
  readonly readers: () => Iterable<(model: AppModel) => ReadonlyArray<NamedProjection<AppModel>>>
  /** The descriptor a recorded write names. */
  readonly registeredMutation: (name: string) => MutationDescriptor<any, any, any>
}

/** A domain's `mutate` and `retry`, as `RemoteDomain` types them for a domain that writes. */
export interface WriteMethods<AppModel> {
  readonly mutate: <M extends MutationDescriptor<any, any, any>>(
    model: AppModel,
    mutation: M,
    input: M extends MutationDescriptor<any, infer Input, any> ? Input : never,
    options?: DomainMutateOptions,
  ) => MutationStarted<AppModel>
  readonly retry: (model: AppModel, requestId: string) => Option.Option<MutationStarted<AppModel>>
}

/** The write capability: binds a domain's `mutate` and `retry`. */
export interface WriteCapability {
  readonly bind: <AppModel, Store extends RemoteModel>(
    context: WriteContext<AppModel, Store>,
  ) => WriteMethods<AppModel>
}

/** The live capability: a live stream, and what its events do to the Model. */
export interface LiveCapability {
  readonly applyEntity: typeof applyEntityEvent
  readonly applyConnection: typeof applyConnectionEvent
  /**
   * What to do with a row a live event inserts into a list: none for the
   * position the event names, `ignore` where the list's body says the row
   * does not belong, and the query's declared policy otherwise.
   */
  readonly policy: (
    lists: Lists,
    visible: EntityStore,
    event: LiveEvent,
    context: ExprContext,
  ) => LivePolicy | undefined
  /** The stream a live entry runs for what it asks, each event a `LiveReceived`. */
  readonly stream: <Message>(
    dependencies: LiveDependencies,
    toMessage: (message: RemoteMessage) => Message,
    options: LiveOptions,
  ) => Stream.Stream<Message, never, RemoteClient>
}

/** What a write's answer carries that a list's body judges. */
export interface Answered {
  readonly entities: ReadonlyArray<NormalizedPatch>
  readonly deleted?: ReadonlyArray<{ readonly entity: string; readonly id: string }> | undefined
  readonly connections?: ReadonlyArray<ConnectionChange> | undefined
}

/** The body capability: a list's body placing rows on the client. */
export interface BodyCapability {
  /** The fields a body places a list's rows by, which its read also asks for; none when it cannot place them. */
  readonly placedFields: (
    body: AnyQuery,
    encoded: Readonly<Record<string, unknown>>,
    operators: MemoryOperators,
  ) => ReadonlyArray<string>
  /** The loaded lists a read's or live patch's news of rows they hold moved, by identity. */
  readonly news: (
    lists: Lists,
    remote: RemoteModel,
    news: ReadonlyArray<NormalizedPatch>,
    before: EntityStore,
    context: ExprContext,
  ) => Readonly<Record<string, Connection>>
  /** The loaded lists a write's answer placed, and those it could not place. */
  readonly answer: (
    capabilities: Capabilities,
    lists: Lists,
    remote: RemoteModel,
    answer: Answered,
    before: EntityStore,
    context: ExprContext,
  ) => {
    readonly placed: Readonly<Record<string, Connection>>
    readonly invalidated: ReadonlyArray<string>
  }
}

/** The live capability, which the live read that asked for a stream installed. */
export const liveIn = (capabilities: Capabilities): LiveCapability =>
  Option.getOrThrowWith(
    capabilities.live,
    () =>
      new Error(
        `Remote: domain "${capabilities.domain}" receives a live event or asks for a live stream, but nothing read it live: read through live, liveQuery or observeLive from foldkit-remote/live`,
      ),
  )

/** The layer capability, which whatever made the Model's layers installed. */
export const layersIn = (capabilities: Capabilities): LayerCapability =>
  Option.getOrThrowWith(
    capabilities.layers,
    () =>
      new Error(
        `Remote: domain "${capabilities.domain}" holds a pending layer or overlay, but nothing that makes one installed the code that shows it: a Mutation the domain registers, overlay from foldkit-remote/overlay, or a live read`,
      ),
  )

export const emptyOptimistic: OptimisticState = { layers: [], overlays: [] }

/** A connection, by identity string or by anything that carries one (a `QueryRef`). */
export type ConnectionIdentity = string | { readonly identity: string }

export const connectionIdentity = (connection: ConnectionIdentity): string =>
  typeof connection === 'string' ? connection : connection.identity

export const addOverlay = (
  optimistic: OptimisticState,
  overlay: ConnectionOverlay,
): OptimisticState => ({
  ...optimistic,
  overlays: [...optimistic.overlays, overlay],
})

const pending = (optimistic: OptimisticState): boolean =>
  optimistic.layers.length > 0 || optimistic.overlays.length > 0

const noKeys: ReadonlySet<EntityKey> = new Set()

const committed = (entities: EntityStore, connection: Connection): ReadonlyArray<Edge> =>
  items(connection).filter(edge => !isTombstone(entities, entityKey(edge.ref.entity, edge.ref.id)))

interface Layered {
  readonly entities: EntityStore
  readonly optimistic: OptimisticState
}

/** The store reads see. */
export const visibleOf = (
  capabilities: Capabilities,
  { entities, optimistic }: Layered,
  operators: MemoryOperators,
): EntityStore =>
  optimistic.layers.length === 0
    ? entities
    : layersIn(capabilities).visible(entities, optimistic, operators)

/** The store a read plans over, from the one it sees. */
export const plannedOf = (
  capabilities: Capabilities,
  { entities, optimistic }: Layered,
  visible: EntityStore,
): EntityStore =>
  optimistic.layers.length === 0
    ? visible
    : layersIn(capabilities).planned(entities, optimistic, visible)

/** The rows only a pending request holds. */
export const requestOnlyOf = (
  capabilities: Capabilities,
  { entities, optimistic }: Layered,
): ReadonlySet<EntityKey> =>
  optimistic.layers.length === 0 ? noKeys : layersIn(capabilities).requestOnly(entities, optimistic)

/** Whether a list hides a row. */
export const goneOf = (
  capabilities: Capabilities,
  { entities, optimistic }: Layered,
): ((key: EntityKey) => boolean) =>
  optimistic.layers.length === 0
    ? key => isTombstone(entities, key)
    : layersIn(capabilities).gone(entities, optimistic)

/** A list's edges with its overlays merged. */
export const edgesOf = (
  capabilities: Capabilities,
  { entities, optimistic }: Layered,
  identity: string,
  connection: Connection,
): ReadonlyArray<Edge> =>
  pending(optimistic)
    ? layersIn(capabilities).edges(entities, optimistic, identity, connection)
    : committed(entities, connection)

/** A list's edges as a read shows them. */
export const shownEdgesOf = (
  capabilities: Capabilities,
  lists: Lists,
  { entities, optimistic }: Layered,
  identity: string,
  connection: Connection,
): ReadonlyArray<Edge> =>
  pending(optimistic)
    ? layersIn(capabilities).shown(lists, entities, optimistic, identity, connection)
    : committed(entities, connection)
