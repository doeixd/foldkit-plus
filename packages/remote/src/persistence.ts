/**
 * `foldkit-remote/persistence`, an entry of its own (#378). Remote cache persistence: a snapshot of the entity store and nothing else.
 * Runtime state (connections' live cursors, optimistic layers, the mutation
 * ledger, gaps, retention roots) is never in a snapshot; it belongs to the
 * session that produced it.
 *
 * The cache is server-derived and disposable: an incompatible, oversized, or
 * corrupt snapshot is discarded (and removed from a `KeyValueStore`) so the
 * planner refetches. `dehydrate`/`hydrate` are the string forms, for SSR and
 * any other transport; `save`/`restore` put them behind Effect's
 * `KeyValueStore`, so the backend (memory, filesystem, SQL, Web Storage) is the
 * application's choice.
 */
import { Duration, Effect, Option, Schema, Stream } from 'effect'
import { KeyValueStore } from 'effect/persistence'
import * as Subscription from 'foldkit/subscription'
import type { EntryWithoutKeepAlive } from 'foldkit/subscription'
import type { Wiring } from 'foldkit-surface'
import { type Connection, type Edge } from './connection.js'
import { connectionIdentity, type ConnectionIdentity } from './capability.js'
import { stableStringify } from './query.js'
import type { RemoteMessage, RemoteModel } from './model.js'
import { emptyStore, mergeStores, type EntityEntry, type EntityStore } from './store.js'

/** Bump when the serialized shape changes; a mismatch discards the cache. */
export const REMOTE_CACHE_VERSION = 5

/**
 * What survives a reload: the entity cache, and the connections an application
 * **declared** should come back.
 *
 * Connections are session state by default and stay that way — `snapshotOf`
 * takes none unless asked. What a declared one keeps is its **edges and
 * nothing else**, which is not a simplification but the rule: a connection's
 * boundaries are cursors the server minted, and a cursor may name server state
 * that no longer exists. Restoring one would be claiming to know where the
 * page ends. The shape has nowhere to put a cursor, so that cannot be got
 * wrong later.
 */
export interface Snapshot {
  readonly entities: EntityStore
  /**
   * By connection identity: its **segments**, each a run of edges. No
   * boundaries.
   *
   * Segments rather than one flat list, because the gaps between them are
   * knowledge too. A connection paged from both ends holds a head and a tail
   * with an unfetched middle; flattening those into one run would claim the
   * tail's first row follows the head's last, which is a thing the client was
   * never told.
   */
  readonly connections: Readonly<Record<string, ReadonlyArray<ReadonlyArray<Edge>>>>
}

/**
 * A snapshot of a Model, keeping the entity cache and only the connections
 * named.
 *
 * Naming none — the default — is exactly what Remote did before connections
 * could be kept at all: a disposable, server-derived cache.
 */
const snapshotOf = (
  model: {
    readonly entities: EntityStore
    readonly connections: Readonly<Record<string, Connection>>
  },
  options: { readonly connections?: ReadonlyArray<ConnectionIdentity> | undefined } = {},
): Snapshot => ({
  entities: model.entities,
  connections: Object.fromEntries(
    (options.connections ?? []).flatMap(connection => {
      const identity = connectionIdentity(connection)
      const held = model.connections[identity]
      return held === undefined
        ? []
        : [[identity, held.segments.map(segment => segment.edges)] as const]
    }),
  ),
})

export interface SnapshotOptions {
  /**
   * Who or what the snapshot is for (a user id, a tenant, a build). A snapshot
   * taken under another scope is discarded rather than shown to the wrong
   * reader. Default: unscoped, which only matches unscoped.
   */
  readonly scope?: string | undefined
  /** Snapshots larger than this many bytes are not written and not read. */
  readonly maxBytes?: number | undefined
}

interface SerializedEntry {
  readonly values: Readonly<Record<string, unknown>>
  readonly present: ReadonlyArray<string>
  readonly stale: ReadonlyArray<string>
  readonly unavailable: ReadonlyArray<string>
  readonly tombstone: boolean
  readonly updatedAt: number
  readonly windows: Readonly<Record<string, string>>
}

interface SerializedStore {
  readonly version: number
  readonly scope: string | null
  readonly entities: Readonly<Record<string, SerializedEntry>>
  readonly connections: Readonly<Record<string, ReadonlyArray<ReadonlyArray<Edge>>>>
}

const sorted = <T>(values: Iterable<T>): T[] => [...values].sort()

/**
 * The snapshot's data shape. `stableStringify` sorts object keys, and the
 * field sets are sorted here, so equal stores give byte-equal snapshots
 * whatever order they were built in.
 */
const serializeStore = (snapshot: Snapshot, scope?: string): SerializedStore => ({
  version: REMOTE_CACHE_VERSION,
  scope: scope ?? null,
  connections: snapshot.connections,
  entities: Object.fromEntries(
    Object.entries(snapshot.entities).map(([key, entry]) => [
      key,
      {
        values: entry.values,
        present: sorted(entry.present),
        stale: sorted(entry.stale),
        unavailable: sorted(entry.unavailable),
        tombstone: entry.tombstone,
        updatedAt: entry.updatedAt,
        windows: entry.windows,
      },
    ]),
  ),
})

const isStringArray = (value: unknown): value is ReadonlyArray<string> =>
  Array.isArray(value) && value.every(item => typeof item === 'string')

const isStringRecord = (value: unknown): value is Readonly<Record<string, string>> =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.values(value as Record<string, unknown>).every(item => typeof item === 'string')

/** Throws on a malformed entry so the whole snapshot is discarded. */
const parseEntry = (value: unknown): EntityEntry => {
  if (value === null || typeof value !== 'object') throw new Error('entry is not an object')
  const entry = value as Record<string, unknown>
  if (entry.values === null || typeof entry.values !== 'object' || Array.isArray(entry.values)) {
    throw new Error('entry.values is not a record')
  }
  if (!isStringArray(entry.present)) throw new Error('entry.present is not a string array')
  if (!isStringArray(entry.stale)) throw new Error('entry.stale is not a string array')
  if (!isStringArray(entry.unavailable)) throw new Error('entry.unavailable is not a string array')
  if (typeof entry.tombstone !== 'boolean') throw new Error('entry.tombstone is not a boolean')
  if (typeof entry.updatedAt !== 'number') throw new Error('entry.updatedAt is not a number')
  if (!isStringRecord(entry.windows)) throw new Error('entry.windows is not a string record')
  return {
    values: entry.values as Readonly<Record<string, unknown>>,
    present: new Set(entry.present),
    stale: new Set(entry.stale),
    unavailable: new Set(entry.unavailable),
    tombstone: entry.tombstone,
    updatedAt: entry.updatedAt,
    windows: entry.windows,
  }
}

/** Throws on a malformed edge so the whole snapshot is discarded. */
const parseEdges = (value: unknown): ReadonlyArray<Edge> => {
  if (!Array.isArray(value)) throw new Error('segment is not an array of edges')
  return value.map(edge => {
    const candidate = edge as { key?: unknown; ref?: { entity?: unknown; id?: unknown } }
    if (
      typeof candidate.key !== 'string' ||
      typeof candidate.ref?.entity !== 'string' ||
      typeof candidate.ref?.id !== 'string'
    ) {
      throw new Error('edge is not { key, ref: { entity, id } }')
    }
    return { key: candidate.key, ref: { entity: candidate.ref.entity, id: candidate.ref.id } }
  })
}

const deserializeStore = (serialized: SerializedStore): Snapshot => ({
  entities: Object.fromEntries(
    Object.entries(serialized.entities).map(([key, entry]) => [key, parseEntry(entry)]),
  ),
  connections: Object.fromEntries(
    Object.entries(serialized.connections ?? {}).map(([key, segments]) => {
      if (!Array.isArray(segments)) throw new Error('connection is not an array of segments')
      return [key, segments.map(parseEdges)]
    }),
  ),
})

/**
 * The snapshot text, or `undefined` when it would exceed `maxBytes`. Build the
 * snapshot with `snapshotOf`, which is where the connections that survive are
 * named; runtime state — optimistic layers, live cursors, gaps, the mutation
 * ledger — is never in one.
 */
function dehydrate(
  snapshot: Snapshot,
  options?: SnapshotOptions & { readonly maxBytes?: undefined },
): string
function dehydrate(snapshot: Snapshot, options?: SnapshotOptions): string | undefined
function dehydrate(snapshot: Snapshot, options: SnapshotOptions = {}): string | undefined {
  const text = stableStringify(serializeStore(snapshot, options.scope))
  return exceeds(text, options.maxBytes) ? undefined : text
}

/**
 * Whether the UTF-8 size of `text` exceeds `maxBytes`. A character is one to
 * three bytes, so most texts are decided from their length alone; only the
 * rest are measured.
 */
const exceeds = (text: string, maxBytes: number | undefined): boolean => {
  if (maxBytes === undefined) return false
  if (text.length > maxBytes) return true
  if (text.length * 3 <= maxBytes) return false
  return new TextEncoder().encode(text).length > maxBytes
}

/**
 * The store a snapshot text holds, or none when the text is missing,
 * oversized, not this version, for another scope, or malformed. Hydrating the
 * same text twice yields equal stores.
 */
const hydrate = (
  raw: string | undefined | null,
  options: SnapshotOptions = {},
): Option.Option<Snapshot> => {
  if (raw === undefined || raw === null) return Option.none()
  if (exceeds(raw, options.maxBytes)) return Option.none()
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return Option.none()
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return Option.none()
  const candidate = parsed as {
    readonly version?: unknown
    readonly scope?: unknown
    readonly entities?: unknown
  }
  if (candidate.version !== REMOTE_CACHE_VERSION) return Option.none()
  if ((candidate.scope ?? null) !== (options.scope ?? null)) return Option.none()
  if (candidate.entities === null || typeof candidate.entities !== 'object') return Option.none()
  if (Array.isArray(candidate.entities)) return Option.none()
  try {
    return Option.some(deserializeStore(candidate as SerializedStore))
  } catch {
    return Option.none()
  }
}

/** An empty snapshot: the cache as a fresh session has it. */
const emptySnapshot: Snapshot = { entities: emptyStore, connections: {} }

export const RemotePersistence = {
  /** The snapshot text, or `undefined` when it would exceed `maxBytes`. */
  dehydrate,
  /** What a snapshot text holds, or none when it is refused. */
  hydrate,
  /**
   * What to keep of a Model, naming the connections that should survive a
   * reload. Naming none is the default and is what Remote always did.
   */
  snapshotOf,
  /** A snapshot's entities brought into a store by policy. */
  mergeStores,
  /** The cache as a fresh session has it; what a refused `restore` yields. */
  emptySnapshot,

  /**
   * Writes the snapshot under `key`, or removes the key when the store would
   * exceed `maxBytes`, so a stale smaller snapshot cannot outlive a larger
   * store it no longer describes.
   */
  save: (snapshot: Snapshot, options: { readonly key: string } & SnapshotOptions) =>
    Effect.gen(function* () {
      const kv = yield* KeyValueStore.KeyValueStore
      const text = dehydrate(snapshot, options)
      if (text === undefined) yield* kv.remove(options.key)
      else yield* kv.set(options.key, text)
    }),

  /**
   * Reads the cache. A missing key yields `emptySnapshot`; anything `hydrate`
   * refuses yields `emptySnapshot` and removes the key, so the next `restore`
   * is clean and the planner refetches.
   */
  restore: (options: { readonly key: string } & SnapshotOptions) =>
    Effect.gen(function* () {
      const kv = yield* KeyValueStore.KeyValueStore
      const raw = yield* kv.get(options.key)
      if (raw === undefined) return emptySnapshot
      const restored = hydrate(raw, options)
      if (Option.isNone(restored)) {
        yield* kv.remove(options.key)
        return emptySnapshot
      }
      return restored.value
    }),
}

/** What `persistence` uses of a domain: `Remote.make`'s value is one. */
export interface PersistedDomain<AppModel> {
  readonly store: { get(model: AppModel): RemoteModel }
  readonly contract: { readonly name: string }
  reduce(model: AppModel, message: RemoteMessage): AppModel
}

/** How `persistence` keeps the cache across a reload. */
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

/** `persistence`'s wiring, and the restore its runtime's `init` starts from. */
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
/**
 * Keeps a domain's cache across a reload, as a wiring beside `Data.wiring`:
 * the stored snapshot for `key` is restored (`Hydrated`, with what the store
 * already holds kept over it, so a page resumed from the server wins)
 * whenever the Model is not yet restored from `key`; and the cache is written
 * back when it changes, once its own snapshot is in. Start `init` from its
 * `restore` so the first frame already holds the snapshot. Overlays,
 * optimistic layers, the mutation ledger, live cursors and gaps are never
 * stored. A change of principal should `forget` in `update`, and name
 * another `key`.
 */
export const persistence = <AppModel>(
  domain: PersistedDomain<AppModel>,
  options: PersistenceOptions<AppModel>,
): PersistenceWiring<AppModel> => {
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
        restored: Option.contains(domain.store.get(model).restoredFrom, key),
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
      const remote = domain.store.get(model)
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
    key: `persistence:${domain.contract.name}`,
    handles: [],
    subscriptions: Subscription.make<AppModel, RemoteMessage, KeyValueStore.KeyValueStore>()(
      () => ({ 'persistence.restore': restoreEntry, 'persistence.save': save }),
    ),
    restore: model =>
      Effect.map(
        hydratedFrom(options.key(model), options.scope(model)),
        Option.match({ onNone: () => model, onSome: message => domain.reduce(model, message) }),
      ),
  }
}
