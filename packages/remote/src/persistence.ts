/**
 * Remote cache persistence: a snapshot of the entity store and nothing else.
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
import { Effect } from 'effect'
import { KeyValueStore } from 'effect/unstable/persistence'
import { items, type Connection, type Edge } from './connection.js'
import { connectionIdentity, type ConnectionIdentity } from './optimistic.js'
import { stableStringify } from './query.js'
import { emptyStore, type EntityEntry, type EntityStore } from './store.js'

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

/** How a snapshot meets a store that already has entries. */
export type MergePolicy = 'replace' | 'preserve-existing'

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
 * The store a snapshot text holds, or `undefined` when the text is missing,
 * oversized, not this version, for another scope, or malformed. Hydrating the
 * same text twice yields equal stores.
 */
const hydrate = (
  raw: string | undefined | null,
  options: SnapshotOptions = {},
): Snapshot | undefined => {
  if (raw === undefined || raw === null) return undefined
  if (exceeds(raw, options.maxBytes)) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
  const candidate = parsed as {
    readonly version?: unknown
    readonly scope?: unknown
    readonly entities?: unknown
  }
  if (candidate.version !== REMOTE_CACHE_VERSION) return undefined
  if ((candidate.scope ?? null) !== (options.scope ?? null)) return undefined
  if (candidate.entities === null || typeof candidate.entities !== 'object') return undefined
  if (Array.isArray(candidate.entities)) return undefined
  try {
    return deserializeStore(candidate as SerializedStore)
  } catch {
    return undefined
  }
}

/**
 * Brings a snapshot into a store that may already hold entries. `replace`
 * takes the snapshot's entry for every key it has; `preserve-existing` keeps
 * an entry the current store already has (it is at least as fresh as a
 * snapshot taken earlier). Either way, keys only the current store has stay.
 */
const mergeStores = (
  current: EntityStore,
  snapshot: EntityStore,
  policy: MergePolicy,
): EntityStore => (policy === 'replace' ? { ...current, ...snapshot } : { ...snapshot, ...current })

/** An empty snapshot: the cache as a fresh session has it. */
const emptySnapshot: Snapshot = { entities: emptyStore, connections: {} }

export const RemotePersistence = {
  /** The snapshot text, or `undefined` when it would exceed `maxBytes`. */
  dehydrate,
  /** What a snapshot text holds, or `undefined` when it is refused. */
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
      if (restored === undefined) {
        yield* kv.remove(options.key)
        return emptySnapshot
      }
      return restored
    }),
}
