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
 *
 * Each row and list saved carries when it expires: when it was fetched plus
 * the `maxAge` of the calls that read it (`persist`). What has expired is
 * dropped when a snapshot is written and again when it is read, and a
 * snapshot past `maxBytes` drops what was read least recently first.
 */
import { Clock, Duration, Effect, Option, Schema, Stream } from 'effect'
import { KeyValueStore } from 'effect/persistence'
import * as Subscription from 'foldkit/subscription'
import type { EntryWithoutKeepAlive } from 'foldkit/subscription'
import type { Wiring } from 'foldkit-surface'
import { connectionIdentity, emptyOptimistic, type ConnectionIdentity } from './capability.js'
import { type Edge } from './connection.js'
import { checkedMaxAge } from './persist.js'
import { stableStringify } from './query.js'
import { recent } from './recent.js'
import { own } from './record.js'
import { reachable, type RetentionRoots } from './retain.js'
import type { RemoteMessage, RemoteModel } from './model.js'
import {
  emptyStore,
  mergeStores,
  type EntityEntry,
  type EntityKey,
  type EntityStore,
  type MergePolicy,
} from './store.js'

/** Bump when the serialized shape changes; a mismatch discards the cache. */
export const REMOTE_CACHE_VERSION = 7

/** How long a saved read lasts when nothing says otherwise: one day. */
const ONE_DAY = 86_400_000

/** A list kept across a reload: its edges, and its age. */
export interface SavedList {
  /**
   * Its **segments**, each a run of edges. No boundaries.
   *
   * Segments rather than one flat list, because the gaps between them are
   * knowledge too. A connection paged from both ends holds a head and a tail
   * with an unfetched middle; flattening those into one run would claim the
   * tail's first row follows the head's last, which is a thing the client was
   * never told.
   */
  readonly segments: ReadonlyArray<ReadonlyArray<Edge>>
  /** When the page that last answered it whole arrived; a restore keeps it, so its age goes on. */
  readonly receivedAt: number
}

/** The rows and lists one batch of reads reached: what is kept or dropped together. */
export interface SavedBatch {
  readonly rows: ReadonlyArray<EntityKey>
  readonly lists: ReadonlyArray<string>
}

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
  /** By connection identity. */
  readonly connections: Readonly<Record<string, SavedList>>
  /**
   * When each row (by entity key) and list (by identity) expires, in clock
   * milliseconds: what is no younger than its `maxAge` then is not written
   * and not restored. One not named never expires.
   */
  readonly expires: {
    readonly rows: Readonly<Record<EntityKey, number>>
    readonly lists: Readonly<Record<string, number>>
  }
  /**
   * The batches of reads that reached the rows and lists, most recently read
   * first. Past `maxBytes` the last go first; a row or list a kept batch also
   * reaches stays. Empty when there is no order, and then a snapshot past
   * `maxBytes` is not written at all.
   */
  readonly recency: ReadonlyArray<SavedBatch>
}

/** What `snapshotOf` reads of a Model. */
export interface Snapshotted {
  readonly entities: EntityStore
  readonly connections: RemoteModel['connections']
  readonly recent: RemoteModel['recent']
}

const noPending: ReadonlySet<string> = new Set()

/**
 * A snapshot of a Model: its rows, and the lists named in `connections`, each
 * expiring `maxAge` after it was fetched, or after what the calls reading it
 * say (`persist`); what such a call says `false` of is left out, unless
 * another read reaches it. Ordered by retention's own recency (`recent`): the
 * active Surfaces' reads first, then those left, newest first, then what no
 * read reaches.
 *
 * Naming no connections — the default — is exactly what Remote did before
 * connections could be kept at all: a disposable, server-derived cache.
 */
const snapshotOf = (
  model: Snapshotted,
  options: {
    readonly connections?: ReadonlyArray<ConnectionIdentity> | undefined
    /** How long a read lasts when no call says (`persist`); default one day. */
    readonly maxAge?: number | undefined
  } = {},
): Snapshot => {
  const maxAge = options.maxAge === undefined ? ONE_DAY : checkedMaxAge(options.maxAge)
  const named = new Set((options.connections ?? []).map(connectionIdentity))
  const rows = new Map<EntityKey, number>()
  const lists = new Map<string, number>()
  // Reached by any read, saved or not: what is left over is reached by none.
  const rooted = new Set<EntityKey>()
  const rootedLists = new Set<string>()
  const later = (at: number | undefined, than: number): number => Math.max(at ?? than, than)

  const keep = (
    root: RetentionRoots,
    persist: number | false | undefined,
    list: Option.Option<string>,
    batch: { readonly rows: Set<EntityKey>; readonly lists: Set<string> },
  ): void => {
    const reached = [
      ...reachable(model.entities, root, model.connections, emptyOptimistic, noPending),
    ].filter(key => Object.hasOwn(model.entities, key))
    for (const key of reached) rooted.add(key)
    if (Option.isSome(list)) rootedLists.add(list.value)
    if (persist === false) return
    const age = persist ?? maxAge
    // The rows a kept list names last as long as it does.
    const listExpires = Option.flatMap(list, identity => {
      const held = own(model.connections, identity)
      if (held === undefined || !named.has(identity)) return Option.none()
      lists.set(identity, later(lists.get(identity), held.receivedAt + age))
      batch.lists.add(identity)
      return Option.some(held.receivedAt + age)
    })
    for (const key of reached) {
      const fetched = model.entities[key]!.oldestAt + age
      const at = Option.match(listExpires, {
        onNone: () => fetched,
        onSome: list => Math.max(fetched, list),
      })
      rows.set(key, later(rows.get(key), at))
      batch.rows.add(key)
    }
  }

  const recency: Array<SavedBatch> = []
  const ordered = [model.recent.active, ...[...model.recent.departed].reverse()]
  for (const roots of ordered) {
    const batch = { rows: new Set<EntityKey>(), lists: new Set<string>() }
    for (const read of roots.requirements)
      keep({ requirements: [read], connections: [] }, read.persist, Option.none(), batch)
    for (const root of roots.connections)
      keep(
        { requirements: [], connections: [root] },
        root.persist,
        Option.some(root.identity),
        batch,
      )
    if (batch.rows.size > 0 || batch.lists.size > 0)
      recency.push({ rows: [...batch.rows], lists: [...batch.lists] })
  }
  // What no read reaches, as an application without retention holds all of
  // its cache: kept for `maxAge`, and dropped before anything read.
  const unread = { rows: new Set<EntityKey>(), lists: new Set<string>() }
  for (const identity of named) {
    if (!rootedLists.has(identity))
      keep(
        { requirements: [], connections: [{ identity }] },
        undefined,
        Option.some(identity),
        unread,
      )
  }
  for (const [key, entry] of Object.entries(model.entities)) {
    if (rooted.has(key) || rows.has(key)) continue
    rows.set(key, entry.oldestAt + maxAge)
    unread.rows.add(key)
  }
  if (unread.rows.size > 0 || unread.lists.size > 0)
    recency.push({ rows: [...unread.rows], lists: [...unread.lists] })

  return {
    entities: Object.fromEntries([...rows.keys()].map(key => [key, model.entities[key]!])),
    connections: Object.fromEntries(
      [...lists.keys()].map(identity => {
        const held = model.connections[identity]!
        return [
          identity,
          { segments: held.segments.map(segment => segment.edges), receivedAt: held.receivedAt },
        ]
      }),
    ),
    expires: { rows: Object.fromEntries(rows), lists: Object.fromEntries(lists) },
    recency,
  }
}

export interface SnapshotOptions {
  /**
   * Who or what the snapshot is for (a user id, a tenant, a build). A snapshot
   * taken under another scope is discarded rather than shown to the wrong
   * reader. Default: unscoped, which only matches unscoped.
   */
  readonly scope?: string | undefined
  /**
   * The most bytes a snapshot takes. One past it drops the batches read least
   * recently until it fits (`Snapshot.recency`); with no order it is not
   * written. A stored text past it is not read.
   */
  readonly maxBytes?: number | undefined
}

/** `dehydrate`'s and `hydrate`'s options: `SnapshotOptions`, and the time to judge ages at. */
export interface ClockedOptions extends SnapshotOptions {
  /**
   * The clock reading, in milliseconds, at which what has expired is dropped.
   * Without it nothing expires: a snapshot carried into a page (SSR) is
   * whole. `save` and `restore` read Effect's `Clock`.
   */
  readonly now?: number | undefined
}

interface SerializedEntry {
  readonly values: Readonly<Record<string, unknown>>
  readonly present: ReadonlyArray<string>
  readonly stale: ReadonlyArray<string>
  readonly unavailable: ReadonlyArray<string>
  readonly tombstone: boolean
  readonly updatedAt: number
  readonly oldestAt: number
  readonly windows: Readonly<Record<string, string>>
  /** `null` for never: JSON has no `Infinity`. */
  readonly expiresAt: number | null
  /** Absent for a row the server sent no revision of, and from an older snapshot. */
  readonly revision?: number
  /** The row's read-after token, while no read has confirmed it: a reload asks again with it. */
  readonly floor?: string
}

interface SerializedList {
  readonly segments: ReadonlyArray<ReadonlyArray<Edge>>
  readonly receivedAt: number
  readonly expiresAt: number | null
}

interface SerializedStore {
  readonly version: number
  readonly scope: string | null
  readonly entities: Readonly<Record<string, SerializedEntry>>
  readonly connections: Readonly<Record<string, SerializedList>>
}

const sorted = <T>(values: Iterable<T>): T[] => [...values].sort()

const expiryOf = (expires: Readonly<Record<string, number>>, key: string): number | null => {
  const at = own(expires, key)
  return at === undefined || !Number.isFinite(at) ? null : at
}

const serializeEntry = (entry: EntityEntry, expiresAt: number | null): SerializedEntry => ({
  values: entry.values,
  present: sorted(entry.present),
  stale: sorted(entry.stale),
  unavailable: sorted(entry.unavailable),
  tombstone: entry.tombstone,
  updatedAt: entry.updatedAt,
  oldestAt: entry.oldestAt,
  windows: entry.windows,
  expiresAt,
  ...(entry.revision === undefined ? {} : { revision: entry.revision }),
  ...(entry.floor === undefined ? {} : { floor: entry.floor }),
})

const serializeList = (list: SavedList, expiresAt: number | null): SerializedList => ({
  segments: list.segments,
  receivedAt: list.receivedAt,
  expiresAt,
})

/**
 * The snapshot's data shape. `stableStringify` sorts object keys, and the
 * field sets are sorted here, so equal stores give byte-equal snapshots
 * whatever order they were built in.
 */
const serializeStore = (snapshot: Snapshot, scope?: string): SerializedStore => ({
  version: REMOTE_CACHE_VERSION,
  scope: scope ?? null,
  connections: Object.fromEntries(
    Object.entries(snapshot.connections).map(([identity, list]) => [
      identity,
      serializeList(list, expiryOf(snapshot.expires.lists, identity)),
    ]),
  ),
  entities: Object.fromEntries(
    Object.entries(snapshot.entities).map(([key, entry]) => [
      key,
      serializeEntry(entry, expiryOf(snapshot.expires.rows, key)),
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

/** An `expiresAt` as stored: a number, or `null` for never. Throws on anything else. */
const parseExpiry = (value: unknown): number | null => {
  if (value === null || typeof value === 'number') return value
  throw new Error('expiresAt is neither a number nor null')
}

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
  if (typeof entry.oldestAt !== 'number') throw new Error('entry.oldestAt is not a number')
  if (!isStringRecord(entry.windows)) throw new Error('entry.windows is not a string record')
  if (entry.revision !== undefined && !Number.isFinite(entry.revision))
    throw new Error('entry.revision is not a finite number')
  if (entry.floor !== undefined && (typeof entry.floor !== 'string' || entry.floor === ''))
    throw new Error('entry.floor is not a token')
  return {
    values: entry.values as Readonly<Record<string, unknown>>,
    present: new Set(entry.present),
    stale: new Set(entry.stale),
    unavailable: new Set(entry.unavailable),
    tombstone: entry.tombstone,
    updatedAt: entry.updatedAt,
    oldestAt: entry.oldestAt,
    windows: entry.windows,
    ...(entry.revision === undefined ? {} : { revision: entry.revision as number }),
    ...(entry.floor === undefined ? {} : { floor: entry.floor as string }),
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

/** Throws on a malformed list so the whole snapshot is discarded. */
const parseList = (value: unknown): SavedList => {
  if (value === null || typeof value !== 'object') throw new Error('list is not an object')
  const list = value as Record<string, unknown>
  if (!Array.isArray(list.segments)) throw new Error('list.segments is not an array')
  if (typeof list.receivedAt !== 'number') throw new Error('list.receivedAt is not a number')
  return { segments: list.segments.map(parseEdges), receivedAt: list.receivedAt }
}

/** The entries of a stored record, each parsed, with when each expires where it does. */
const parsed = <A>(
  record: unknown,
  parse: (value: unknown) => A,
): {
  readonly values: Readonly<Record<string, A>>
  readonly expires: Readonly<Record<string, number>>
} => {
  if (record === null || typeof record !== 'object' || Array.isArray(record))
    throw new Error('not a record')
  const entries = Object.entries(record as Record<string, unknown>)
  return {
    values: Object.fromEntries(entries.map(([key, value]) => [key, parse(value)])),
    expires: Object.fromEntries(
      entries.flatMap(([key, value]) => {
        const at = parseExpiry((value as { readonly expiresAt?: unknown }).expiresAt)
        return at === null ? [] : [[key, at]]
      }),
    ),
  }
}

const deserializeStore = (serialized: SerializedStore): Snapshot => {
  const entities = parsed(serialized.entities, parseEntry)
  const connections = parsed(serialized.connections, parseList)
  return {
    entities: entities.values,
    connections: connections.values,
    expires: { rows: entities.expires, lists: connections.expires },
    recency: [],
  }
}

/** `snapshot` without what has expired by `now`. */
const unexpired = (snapshot: Snapshot, now: number): Snapshot => {
  const alive = (expires: Readonly<Record<string, number>>, key: string): boolean =>
    (own(expires, key) ?? Infinity) > now
  const rows = Object.keys(snapshot.entities).filter(key => alive(snapshot.expires.rows, key))
  const lists = Object.keys(snapshot.connections).filter(key => alive(snapshot.expires.lists, key))
  return rows.length === Object.keys(snapshot.entities).length &&
    lists.length === Object.keys(snapshot.connections).length
    ? snapshot
    : restricted(snapshot, new Set(rows), new Set(lists))
}

/** `snapshot` with only the rows and lists named. */
const restricted = (
  snapshot: Snapshot,
  rows: ReadonlySet<string>,
  lists: ReadonlySet<string>,
): Snapshot => {
  const kept = <A>(record: Readonly<Record<string, A>>, keys: ReadonlySet<string>) =>
    Object.fromEntries(Object.entries(record).filter(([key]) => keys.has(key)))
  return {
    entities: kept(snapshot.entities, rows),
    connections: kept(snapshot.connections, lists),
    expires: {
      rows: kept(snapshot.expires.rows, rows),
      lists: kept(snapshot.expires.lists, lists),
    },
    recency: snapshot.recency,
  }
}

/** The UTF-8 size of `text`, as `TextEncoder` writes it (a lone surrogate as three bytes). */
const utf8Length = (text: string): number => {
  let bytes = 0
  for (let at = 0; at < text.length; at++) {
    const code = text.charCodeAt(at)
    if (code < 0x80) bytes += 1
    else if (code < 0x800) bytes += 2
    else if (
      code >= 0xd800 &&
      code < 0xdc00 &&
      at + 1 < text.length &&
      (text.charCodeAt(at + 1) & 0xfc00) === 0xdc00
    ) {
      bytes += 4
      at++
    } else bytes += 3
  }
  return bytes
}

/**
 * The batches of `snapshot` that fit `maxBytes` written, the most recently
 * read first, up to the first that does not fit: it and every older one are
 * dropped, but for what a kept batch also reaches. What no batch names goes
 * last. Sizes are counted per row and list, as `stableStringify` writes them
 * into the text, so the text is built once.
 */
const fitted = (snapshot: Snapshot, scope: string | undefined, maxBytes: number): Snapshot => {
  const piece = (key: string, value: unknown): number =>
    utf8Length(`${JSON.stringify(key)}:${stableStringify(value)}`) + 1
  const rowCost = (key: string): number =>
    piece(key, serializeEntry(snapshot.entities[key]!, expiryOf(snapshot.expires.rows, key)))
  const listCost = (identity: string): number =>
    piece(
      identity,
      serializeList(snapshot.connections[identity]!, expiryOf(snapshot.expires.lists, identity)),
    )
  const named = {
    rows: new Set(snapshot.recency.flatMap(batch => batch.rows)),
    lists: new Set(snapshot.recency.flatMap(batch => batch.lists)),
  }
  const batches = [
    ...snapshot.recency,
    {
      rows: Object.keys(snapshot.entities).filter(key => !named.rows.has(key)),
      lists: Object.keys(snapshot.connections).filter(key => !named.lists.has(key)),
    },
  ]
  const rows = new Set<string>()
  const lists = new Set<string>()
  // Each piece is counted with a comma after it; a record holding any has one fewer.
  let size = utf8Length(stableStringify(serializeStore(restricted(snapshot, rows, lists), scope)))
  for (const batch of batches) {
    const newRows = [...new Set(batch.rows)].filter(
      key => !rows.has(key) && Object.hasOwn(snapshot.entities, key),
    )
    const newLists = [...new Set(batch.lists)].filter(
      key => !lists.has(key) && Object.hasOwn(snapshot.connections, key),
    )
    const cost =
      newRows.reduce((sum, key) => sum + rowCost(key), 0) +
      newLists.reduce((sum, key) => sum + listCost(key), 0)
    const commas =
      (rows.size + newRows.length > 0 ? 1 : 0) + (lists.size + newLists.length > 0 ? 1 : 0)
    if (size + cost - commas > maxBytes) break
    size += cost
    for (const key of newRows) rows.add(key)
    for (const key of newLists) lists.add(key)
  }
  return restricted(snapshot, rows, lists)
}

/**
 * The snapshot text, without what has expired by `now`, or `undefined` when
 * it would exceed `maxBytes` even after dropping what was read least recently
 * (`Snapshot.recency`). Build the snapshot with `snapshotOf`, which is where
 * the connections that survive are named; runtime state — optimistic layers,
 * live cursors, gaps, the mutation ledger — is never in one.
 */
function dehydrate(
  snapshot: Snapshot,
  options?: ClockedOptions & { readonly maxBytes?: undefined },
): string
function dehydrate(snapshot: Snapshot, options?: ClockedOptions): string | undefined
function dehydrate(snapshot: Snapshot, options: ClockedOptions = {}): string | undefined {
  const live = options.now === undefined ? snapshot : unexpired(snapshot, options.now)
  const text = stableStringify(serializeStore(live, options.scope))
  if (options.maxBytes === undefined || !exceeds(text, options.maxBytes)) return text
  if (live.recency.length === 0) return undefined
  const fit = stableStringify(
    serializeStore(fitted(live, options.scope, options.maxBytes), options.scope),
  )
  return exceeds(fit, options.maxBytes) ? undefined : fit
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
 * The store a snapshot text holds, without what has expired by `now`, or none
 * when the text is missing, oversized, not this version, for another scope, or
 * malformed. Hydrating the same text twice yields equal stores.
 */
const hydrate = (
  raw: string | undefined | null,
  options: ClockedOptions = {},
): Option.Option<Snapshot> => {
  if (raw === undefined || raw === null) return Option.none()
  if (exceeds(raw, options.maxBytes)) return Option.none()
  let parsedText: unknown
  try {
    parsedText = JSON.parse(raw)
  } catch {
    return Option.none()
  }
  if (parsedText === null || typeof parsedText !== 'object' || Array.isArray(parsedText))
    return Option.none()
  const candidate = parsedText as { readonly version?: unknown; readonly scope?: unknown }
  if (candidate.version !== REMOTE_CACHE_VERSION) return Option.none()
  if ((candidate.scope ?? null) !== (options.scope ?? null)) return Option.none()
  try {
    const snapshot = deserializeStore(candidate as SerializedStore)
    return Option.some(options.now === undefined ? snapshot : unexpired(snapshot, options.now))
  } catch {
    return Option.none()
  }
}

/**
 * The `Hydrated` Message that brings a snapshot into the Model: its rows by
 * `merge`, and its lists with the age they had, stale so they refetch.
 * `from` names the storage key it was read from (`restoredFrom`).
 */
const hydrated = (
  snapshot: Snapshot,
  options: { readonly merge: MergePolicy; readonly from?: string | undefined },
): Extract<RemoteMessage, { readonly _tag: 'Hydrated' }> => {
  const lists = Object.entries(snapshot.connections)
  return {
    _tag: 'Hydrated',
    entities: snapshot.entities,
    connections: Object.fromEntries(lists.map(([identity, list]) => [identity, list.segments])),
    receivedAt: Object.fromEntries(lists.map(([identity, list]) => [identity, list.receivedAt])),
    merge: options.merge,
    ...(options.from === undefined ? {} : { from: options.from }),
  }
}

/** An empty snapshot: the cache as a fresh session has it. */
const emptySnapshot: Snapshot = {
  entities: emptyStore,
  connections: {},
  expires: { rows: {}, lists: {} },
  recency: [],
}

export const RemotePersistence = {
  /** The snapshot text, or `undefined` when it would exceed `maxBytes`. */
  dehydrate,
  /** What a snapshot text holds, or none when it is refused. */
  hydrate,
  /**
   * What to keep of a Model, naming the connections that should survive a
   * reload and how long a read lasts. Naming none is the default and is what
   * Remote always did.
   */
  snapshotOf,
  /** A snapshot's entities brought into a store by policy. */
  mergeStores,
  /** The `Hydrated` Message that brings a snapshot into the Model. */
  hydrated,
  /** The cache as a fresh session has it; what a refused `restore` yields. */
  emptySnapshot,

  /**
   * Writes the snapshot under `key`, without what has expired by the `Clock`
   * and within `maxBytes`, or removes the key when not even that fits, so a
   * stale smaller snapshot cannot outlive a larger store it no longer
   * describes.
   */
  save: (snapshot: Snapshot, options: { readonly key: string } & SnapshotOptions) =>
    Effect.gen(function* () {
      const kv = yield* KeyValueStore.KeyValueStore
      const now = yield* Clock.currentTimeMillis
      const text = dehydrate(snapshot, { ...options, now })
      if (text === undefined) yield* kv.remove(options.key)
      else yield* kv.set(options.key, text)
    }),

  /**
   * Reads the cache, without what has expired by the `Clock`. A missing key
   * yields `emptySnapshot`; anything `hydrate` refuses yields `emptySnapshot`
   * and removes the key, so the next `restore` is clean and the planner
   * refetches.
   */
  restore: (options: { readonly key: string } & SnapshotOptions) =>
    Effect.gen(function* () {
      const kv = yield* KeyValueStore.KeyValueStore
      const raw = yield* kv.get(options.key)
      if (raw === undefined) return emptySnapshot
      const restored = hydrate(raw, { ...options, now: yield* Clock.currentTimeMillis })
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
  /**
   * How long a saved row or list lasts, in milliseconds from when it was
   * fetched, unless the call reading it says (`Data.subscriptions`'
   * `persist`). Restoring it does not make it younger. Default one day.
   */
  readonly maxAge?: number | undefined
  /** What to keep, when it is not `snapshotOf` the `connections`; build it with `snapshotOf` and the `maxAge` given. */
  readonly snapshot?:
    | ((remote: RemoteModel, options: { readonly maxAge: number }) => Snapshot)
    | undefined
  /** The most bytes a snapshot takes; past it, what was read least recently goes first. */
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

/** The cache as of one Model change, kept by the revision its save waits on. */
interface Revision {
  readonly remote: RemoteModel
  readonly scope: string
  readonly revision: number
}

/**
 * Keeps a domain's cache across a reload, as a wiring beside `Data.wiring`:
 * the stored snapshot for `key` is restored (`Hydrated`, with what the store
 * already holds kept over it, so a page resumed from the server wins)
 * whenever the Model is not yet restored from `key`; and the cache is written
 * back when it changes, once its own snapshot is in. Start `init` from its
 * `restore` so the first frame already holds the snapshot. Each saved row and
 * list lasts `maxAge` from when it was fetched; past `maxBytes`, what was read
 * least recently goes first. Overlays, optimistic layers, the mutation ledger,
 * live cursors and gaps are never stored. A change of principal should
 * `forget` in `update`, and name another `key`.
 */
export const persistence = <AppModel>(
  domain: PersistedDomain<AppModel>,
  options: PersistenceOptions<AppModel>,
): PersistenceWiring<AppModel> => {
  const connections = (options.connections ?? []).map(connectionIdentity)
  const maxAge = options.maxAge === undefined ? ONE_DAY : checkedMaxAge(options.maxAge)
  const snapshotOf =
    options.snapshot ??
    ((remote: RemoteModel) => RemotePersistence.snapshotOf(remote, { connections, maxAge }))
  const debounce = options.debounce ?? '250 millis'
  // A save judges ages by the clock when it writes, so the snapshot is built
  // then, from the Model its revision names. A revision moves when the store,
  // the lists, retention's recency or the scope does.
  let last: Option.Option<Revision> = Option.none()
  const revisions = recent<number, Revision>(4)
  const revisionOf = (remote: RemoteModel, scope: string): number => {
    const same = Option.exists(
      last,
      held =>
        held.remote.entities === remote.entities &&
        held.remote.connections === remote.connections &&
        held.remote.recent === remote.recent &&
        held.scope === scope,
    )
    if (!same) {
      const revision = Option.match(last, { onNone: () => 1, onSome: held => held.revision + 1 })
      const next = { remote, scope, revision }
      last = Option.some(next)
      revisions.set(revision, next)
    }
    return Option.match(last, { onNone: () => 0, onSome: held => held.revision })
  }
  // A store that cannot be read restores nothing, so nothing is saved
  // under this key: an unread snapshot is never written over.
  const hydratedFrom = (
    key: string,
    scope: string,
  ): Effect.Effect<Option.Option<RemoteMessage>, never, KeyValueStore.KeyValueStore> =>
    RemotePersistence.restore({ key, scope, maxBytes: options.maxBytes }).pipe(
      Effect.map((snapshot): RemoteMessage =>
        hydrated(snapshot, { merge: 'preserve-existing', from: key }),
      ),
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
    { readonly key: string; readonly restored: boolean; readonly revision: number },
    KeyValueStore.KeyValueStore
  > = {
    dependenciesSchema: Schema.Struct({
      key: Schema.String,
      restored: Schema.Boolean,
      revision: Schema.Number,
    }),
    modelToDependencies: model => {
      const remote = domain.store.get(model)
      const key = options.key(model)
      const restored = Option.contains(remote.restoredFrom, key)
      return {
        key,
        restored,
        revision: restored ? revisionOf(remote, options.scope(model)) : 0,
      }
    },
    // A changed cache restarts this stream, so the wait is the debounce.
    dependenciesToStream: ({ key, restored, revision }) =>
      restored
        ? Stream.fromEffect(
            Effect.gen(function* () {
              yield* Effect.sleep(debounce)
              const held = revisions.get(revision)
              // A Model this many changes on has its own save running.
              if (held === undefined) return
              // Too large to keep, `save` removes the key: no stale smaller
              // snapshot may outlive it.
              yield* RemotePersistence.save(snapshotOf(held.remote, { maxAge }), {
                key,
                scope: held.scope,
                maxBytes: options.maxBytes,
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
