/**
 * The durable outbox's store (#247, operations phase 7): a write made with
 * `Data.mutate(…, { durable: true })` is queued in the Model, copied to a
 * `KeyValueStore`, and sent from there, in order, by one tab, so a reload
 * keeps it, layer and all, and sends it again with the same operation id and
 * the same `now`. Remote sends it later; Sync converges, which this does not.
 *
 * The Model's queue is the truth for this page; the store is its copy, shared
 * by every tab on the same key, and written as a merge so no tab's write
 * overwrites another's.
 */
import { Context, Duration, Effect, Option, Random, Schema } from 'effect'
import { KeyValueStore } from 'effect/persistence'
import type { Computation } from 'foldkit-entity'
import type { OptimisticOperation } from './optimistic.js'
import { remoteErrorSchema, type RemoteError } from './remoteData.js'
import { Queued, withDone, type OutboxState, type ReadEntry } from './queue.js'
import { RelationRequest } from './wire.js'

/** Where a queued write stands, as the store keeps it. */
export type QueuedState =
  | { readonly _tag: 'Waiting' }
  | { readonly _tag: 'Failed'; readonly error: RemoteError }

const QueuedStateSchema = Schema.Union([
  Schema.Struct({ _tag: Schema.Literal('Waiting') }),
  Schema.Struct({ _tag: Schema.Literal('Failed'), error: remoteErrorSchema }),
])

const CollationSchema = Schema.Union([
  Schema.Struct({ _tag: Schema.Literal('Binary') }),
  Schema.Struct({ _tag: Schema.Literal('AsciiFold') }),
  Schema.Struct({ _tag: Schema.Literal('Locale'), locale: Schema.String }),
])

const ComputationSchema: Schema.Codec<Computation> = Schema.Union([
  Schema.Struct({ _tag: Schema.Literal('Field'), key: Schema.String }),
  Schema.Struct({ _tag: Schema.Literal('Value'), value: Schema.Unknown }),
  Schema.Struct({
    _tag: Schema.Literal('Call'),
    operator: Schema.String,
    args: Schema.Array(Schema.suspend((): Schema.Codec<Computation> => ComputationSchema)),
    collation: Schema.NullOr(CollationSchema),
  }),
])

const Ref = Schema.Struct({ entity: Schema.String, id: Schema.String })

/** The layer a write showed, as stored: read back only where every operation still has its shape. */
const OptimisticSchema: Schema.Codec<OptimisticOperation> = Schema.Union([
  Schema.Struct({
    entity: Schema.String,
    id: Schema.String,
    values: Schema.Record(Schema.String, Schema.Unknown),
    adds: Schema.optionalKey(Schema.Record(Schema.String, Schema.Number)),
    computes: Schema.optionalKey(Schema.Record(Schema.String, ComputationSchema)),
  }),
  Schema.Struct({ _tag: Schema.Literal('Delete'), entity: Schema.String, id: Schema.String }),
  Schema.Struct({
    _tag: Schema.Literal('Insert'),
    connection: Schema.String,
    position: Schema.Literals(['prepend', 'append']),
    edge: Schema.Struct({ key: Schema.String, ref: Ref }),
  }),
  Schema.Struct({
    _tag: Schema.Literal('Remove'),
    connection: Schema.String,
    edge: Schema.Struct({ key: Schema.String, ref: Ref }),
  }),
])

/**
 * A durable write as the store keeps it: what a later page needs to show it
 * and send it as itself. Its input is encoded by the Mutation's `Input`, so a
 * page reads it back with the Mutation it has then.
 */
export const StoredWrite = Schema.Struct({
  /** Its operation id, which is also its request id. */
  operation: Schema.String,
  mutation: Schema.String,
  input: Schema.Unknown,
  keys: Schema.optionalKey(Schema.Array(Schema.String)),
  now: Schema.optionalKey(Schema.Number),
  /** The layer it shows until it settles. */
  optimistic: Schema.Array(OptimisticSchema),
  /** Who its layer was predicted for. */
  viewer: Schema.optionalKey(Ref),
  /** What the reader was shown when they acted, for the answer to carry. */
  shown: Schema.Array(RelationRequest),
  /** Moves on each change of `state`; of two copies, the higher wins. */
  revision: Schema.Number,
  state: QueuedStateSchema,
})
export type StoredWrite = typeof StoredWrite.Type

/** What makes a stored entry an operation at all: one without these is dropped. */
const OperationKey = Schema.Struct({ operation: Schema.String, revision: Schema.Number })
const keyOf = Schema.decodeUnknownOption(OperationKey)

const OUTBOX_VERSION = 1

/** The record one key holds: every tab's queued writes, and the operations settled lately. */
const StoredOutboxSchema = Schema.Struct({
  version: Schema.Literal(OUTBOX_VERSION),
  scope: Schema.String,
  entries: Schema.Array(Schema.Unknown),
  done: Schema.Array(Schema.String),
})

/** A key's queue as stored, each entry as it was written, read or not. */
export interface StoredOutbox {
  readonly entries: ReadonlyArray<unknown>
  readonly done: ReadonlyArray<string>
}

export const emptyStoredOutbox: StoredOutbox = { entries: [], done: [] }

/**
 * Two copies of a queue as one: entries of both by operation, none that
 * either settled, the higher revision of each, in the store's order and then
 * mine. A join, so tabs that save at once lose nothing the next save does
 * not put back.
 */
export const mergeStored = (store: StoredOutbox, mine: StoredOutbox): StoredOutbox => {
  const done = withDone(store.done, mine.done)
  const gone = new Set(done)
  const kept = new Map<string, { readonly raw: unknown; readonly revision: number }>()
  for (const raw of [...store.entries, ...mine.entries]) {
    const key = keyOf(raw)
    if (Option.isNone(key) || gone.has(key.value.operation)) continue
    const held = kept.get(key.value.operation)
    if (held === undefined || held.revision < key.value.revision) {
      kept.set(key.value.operation, { raw, revision: key.value.revision })
    }
  }
  return { entries: [...kept.values()].map(({ raw }) => raw), done }
}

/** The record under `key` for `scope`: none when absent, of another scope or version, or not JSON. */
export const readStored = (
  key: string,
  scope: string,
): Effect.Effect<StoredOutbox, KeyValueStore.KeyValueStoreError, KeyValueStore.KeyValueStore> =>
  Effect.gen(function* () {
    const kv = yield* KeyValueStore.KeyValueStore
    const text = yield* kv.get(key)
    if (text === undefined) return emptyStoredOutbox
    const parsed = Schema.decodeUnknownOption(Schema.fromJsonString(StoredOutboxSchema))(text)
    return Option.match(parsed, {
      onNone: () => emptyStoredOutbox,
      onSome: record =>
        record.scope === scope ? { entries: record.entries, done: record.done } : emptyStoredOutbox,
    })
  })

/**
 * Whether the record under `key` holds writes waiting for another scope than
 * `scope`: a key that is not one per principal. Writing over it would lose
 * them, so it is not written.
 */
export const othersWaiting = (
  key: string,
  scope: string,
): Effect.Effect<boolean, KeyValueStore.KeyValueStoreError, KeyValueStore.KeyValueStore> =>
  Effect.gen(function* () {
    const text = yield* (yield* KeyValueStore.KeyValueStore).get(key)
    return Option.exists(
      Option.flatMap(Option.fromUndefinedOr(text), stored =>
        Schema.decodeUnknownOption(Schema.fromJsonString(StoredOutboxSchema))(stored),
      ),
      record => record.scope !== scope && record.entries.length > 0,
    )
  })

export const storedText = (outbox: StoredOutbox, scope: string): string =>
  JSON.stringify({ version: OUTBOX_VERSION, scope, entries: outbox.entries, done: outbox.done })

/** A queue's text, as `storedText` wrote it, read back. */
export const storedFromText = (text: string): StoredOutbox =>
  Option.match(Schema.decodeUnknownOption(Schema.fromJsonString(StoredOutboxSchema))(text), {
    onNone: () => emptyStoredOutbox,
    onSome: ({ entries, done }) => ({ entries, done }),
  })

/**
 * Whether the store says `operation` is settled: done, or refused. A store
 * that lacks it says nothing (it could not be written), and it is sent.
 */
export const settledIn = (outbox: StoredOutbox, operation: string): boolean =>
  outbox.done.includes(operation) ||
  outbox.entries.some(raw =>
    Option.exists(
      Schema.decodeUnknownOption(StoredWrite)(raw),
      write => write.operation === operation && write.state._tag !== 'Waiting',
    ),
  )

/** The queue as the store keeps it. */
export const storedOf = (outbox: OutboxState): StoredOutbox => ({
  entries: outbox.queue.map(
    Queued.$match({ Readable: ({ write }) => write, Unreadable: ({ raw }) => raw }),
  ),
  done: outbox.done,
})

/** The write sent next: the oldest one waiting that the store holds. */
export const headOf = (outbox: OutboxState): Option.Option<StoredWrite> => {
  for (const queued of outbox.queue) {
    if (queued._tag === 'Readable' && queued.write.state._tag === 'Waiting' && queued.stored) {
      return Option.some(queued.write)
    }
  }
  return Option.none()
}

/** A stored queue as a page reads it, entry by entry: one bad entry never fails the rest. */
export const readEntries = (
  outbox: StoredOutbox,
  inputOf: (
    mutation: string,
  ) => Option.Option<(input: unknown) => Option.Option<{ readonly decoded: unknown }>>,
): ReadonlyArray<ReadEntry> =>
  outbox.entries.flatMap((raw): ReadonlyArray<ReadEntry> => {
    const key = keyOf(raw)
    // Not an operation at all: nothing to send, show, or dismiss.
    if (Option.isNone(key)) return []
    const unreadable = (reason: string): ReadonlyArray<ReadEntry> => [
      { _tag: 'Unreadable', ...key.value, raw, reason },
    ]
    const write = Schema.decodeUnknownOption(StoredWrite)(raw)
    if (Option.isNone(write)) return unreadable('it was stored in a shape this version cannot read')
    return Option.match(inputOf(write.value.mutation), {
      onNone: () => unreadable(`${write.value.mutation} is not a mutation this version registers`),
      onSome: decode =>
        Option.match(decode(write.value.input), {
          onNone: () => unreadable(`its input no longer decodes as ${write.value.mutation}'s`),
          onSome: ({ decoded }) => [{ _tag: 'Readable', write: write.value, input: decoded }],
        }),
    })
  })

/**
 * Where the outbox takes its Web Locks: the browser's, where it has them. A
 * trace, which is one tab, takes none.
 */
export const OutboxLocks = Context.Reference<Option.Option<LockManager>>(
  'foldkit-remote/OutboxLocks',
  { defaultValue: () => Option.fromUndefinedOr(globalThis.navigator?.locks) },
)

/**
 * Holds the Web Lock `name` while `effect` runs, where there are Web Locks;
 * elsewhere runs it as it is (one tab, or a server).
 */
export const withLock = <A, E, R>(
  name: string,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.flatMap(Effect.service(OutboxLocks), held =>
    Option.match(held, {
      onNone: () => effect,
      onSome: locks => heldWhile(locks, name, effect),
    }),
  )

const heldWhile = <A, E, R>(
  locks: LockManager,
  name: string,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.acquireUseRelease(
    Effect.callback<() => void>((resume, signal) => {
      locks
        .request(name, { signal }, () => {
          let release: () => void = () => undefined
          const held = new Promise<void>(done => {
            release = done
          })
          resume(Effect.succeed(release))
          return held
        })
        // An abandoned wait rejects with the signal's reason; nothing waits on it.
        .catch(() => undefined)
    }),
    () => effect,
    release => Effect.sync(release),
  )

/** The `BroadcastChannel` the tabs on one key speak on; none where there is none. */
export const channelFor = (key: string): Option.Option<BroadcastChannel> =>
  typeof globalThis.BroadcastChannel === 'function'
    ? Option.some(new globalThis.BroadcastChannel(`foldkit-remote-outbox:${key}`))
    : Option.none()

/** The lock the tabs on one key send under: one sends, the others wait. */
export const sendLock = (key: string): string => `foldkit-remote-outbox:${key}:send`

/** The lock a write to the store is made under, so two tabs never write it at once. */
export const storeLock = (key: string): string => `foldkit-remote-outbox:${key}:store`

/** How long the outbox waits before sending again after `attempt` sends nothing answered. */
export interface RetryOptions {
  /** The first wait; 1 second unless given. */
  readonly base?: Duration.Input | undefined
  /** The longest; 30 seconds unless given. */
  readonly max?: Duration.Input | undefined
}

/** `base` doubled per attempt, up to `max`, ±20% so tabs that failed together do not retry together. */
export const backoff = (
  attempt: number,
  options: RetryOptions = {},
): Effect.Effect<Duration.Duration> => {
  const base = Duration.toMillis(Duration.fromInputUnsafe(options.base ?? '1 second'))
  const max = Duration.toMillis(Duration.fromInputUnsafe(options.max ?? '30 seconds'))
  const wait = Math.min(max, base * 2 ** Math.max(0, attempt - 1))
  return Effect.map(Random.nextBetween(0.8, 1.2), jitter => Duration.millis(wait * jitter))
}

/**
 * Waits until the browser says it is online again, where it can say so;
 * never elsewhere. A wait for a retry races it, so a write goes as soon as
 * the network is back.
 */
export const onlineAgain: Effect.Effect<void> = Effect.callback<void>(resume => {
  const target = globalThis.window
  if (target === undefined || typeof target.addEventListener !== 'function') return
  const online = () => resume(Effect.void)
  target.addEventListener('online', online, { once: true })
  return Effect.sync(() => target.removeEventListener('online', online))
})
