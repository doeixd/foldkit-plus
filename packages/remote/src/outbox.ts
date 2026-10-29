/**
 * The durable outbox (#247, operations phase 7): a write made with
 * `Data.mutate(…, { durable: true })` is queued in the Model, copied to a
 * `KeyValueStore`, and sent from there, in order, by one tab, so a reload
 * keeps it, layer and all, and sends it again with the same operation id and
 * the same `now`. Remote sends it later; Sync converges, which this does not.
 *
 * The Model's queue is the truth for this page; the store is its copy, shared
 * by every tab on the same key, and written as a merge so no tab's write
 * overwrites another's.
 */
import { Context, Data, Duration, Effect, Option, Random, Schema } from 'effect'
import { KeyValueStore } from 'effect/persistence'
import type { Computation } from 'foldkit-entity'
import type { OptimisticOperation } from './optimistic.js'
import { remoteErrorSchema, type RemoteError } from './remoteData.js'
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
 * How many settled operation ids are kept. A copy of a write settled longer
 * ago than this could come back from a tab that slept through it; the
 * server's ledger answers it again from its record.
 */
const DONE_WINDOW = 256

/** `done` with `settled` after it, the newest `DONE_WINDOW`, each once. */
export const withDone = (
  done: ReadonlyArray<string>,
  settled: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  if (settled.every(operation => done.includes(operation))) return done
  const kept = new Set(done)
  for (const operation of settled) kept.add(operation)
  return [...kept].slice(-DONE_WINDOW)
}

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

/** A queued write in the Model. */
export type Queued = Data.TaggedEnum<{
  /** One this version can send: shown, in the ledger, and sent in its turn. */
  Readable: {
    readonly write: StoredWrite
    /** Whether the store is known to hold this revision: only then is it sent. */
    readonly stored: boolean
    /** Sends in a row that nothing answered, this page. */
    readonly attempt: number
    /** Why the last of them failed. */
    readonly delayed: Option.Option<RemoteError>
  }
  /** One this version cannot read (a Mutation it lacks, an input that no longer decodes): kept, never sent. */
  Unreadable: {
    readonly operation: string
    readonly revision: number
    /** The entry as it was stored, written back as it is. */
    readonly raw: unknown
    readonly reason: string
    readonly stored: boolean
  }
}>
export const Queued = Data.taggedEnum<Queued>()

/** The durable writes this page holds, and the store they are copied to. */
export interface OutboxState {
  /** Names this page load's operations; minted by the outbox's restore. */
  readonly session: Option.Option<string>
  /** The store key the queue was read from; it is saved there and nowhere else. */
  readonly key: Option.Option<string>
  /** Every tab's queued writes, in the order they are sent. */
  readonly queue: ReadonlyArray<Queued>
  /** Operations settled lately, here or in another tab. */
  readonly done: ReadonlyArray<string>
}

export const emptyOutbox: OutboxState = {
  session: Option.none(),
  key: Option.none(),
  queue: [],
  done: [],
}

export const operationOf = Queued.$match({
  Readable: ({ write }) => write.operation,
  Unreadable: ({ operation }) => operation,
})

export const revisionOf = Queued.$match({
  Readable: ({ write }) => write.revision,
  Unreadable: ({ revision }) => revision,
})

const isStored = Queued.$match({
  Readable: ({ stored }) => stored,
  Unreadable: ({ stored }) => stored,
})

/** The queue as the store keeps it. */
export const storedOf = (outbox: OutboxState): StoredOutbox => ({
  entries: outbox.queue.map(
    Queued.$match({ Readable: ({ write }) => write, Unreadable: ({ raw }) => raw }),
  ),
  done: outbox.done,
})

/** Whether every queued write is in the store as the Model holds it. */
export const allStored = (outbox: OutboxState): boolean => outbox.queue.every(isStored)

/** The write sent next: the oldest one waiting that the store holds. */
export const headOf = (outbox: OutboxState): Option.Option<StoredWrite> => {
  for (const queued of outbox.queue) {
    if (queued._tag === 'Readable' && queued.write.state._tag === 'Waiting' && queued.stored) {
      return Option.some(queued.write)
    }
  }
  return Option.none()
}

/**
 * A stored entry as a page reads it: a write it can send, with its input
 * decoded, or one it cannot, with why.
 */
export type ReadEntry =
  | { readonly _tag: 'Readable'; readonly write: StoredWrite; readonly input: unknown }
  | {
      readonly _tag: 'Unreadable'
      readonly operation: string
      readonly revision: number
      readonly raw: unknown
      readonly reason: string
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

/** One item of `Data.outboxStatus`. */
export interface OutboxItem {
  readonly requestId: string
  /** The Mutation it names; none where the stored entry names none this version can read. */
  readonly mutation: Option.Option<string>
  readonly state: OutboxItemState
}

export type OutboxItemState = Data.TaggedEnum<{
  /** Not answered yet: `attempt` sends nothing answered so far, `error` the last one's. */
  Waiting: { readonly attempt: number; readonly error: Option.Option<RemoteError> }
  /** The server answered no: `Data.retry` or `Data.dismiss` it. */
  Failed: { readonly error: RemoteError }
  /** Stored by a version of the app this one cannot read: `Data.dismiss` it. */
  Unreadable: { readonly reason: string }
}>
export const OutboxItemState = Data.taggedEnum<OutboxItemState>()

/** What the outbox holds, for a view: "3 changes waiting". */
export interface OutboxStatus {
  readonly waiting: number
  readonly failed: number
  /** Every durable write not yet settled, in the order they are sent. */
  readonly items: ReadonlyArray<OutboxItem>
}

const MutationName = Schema.Struct({ mutation: Schema.String })

export const outboxStatus = (outbox: OutboxState): OutboxStatus => {
  const items = outbox.queue.map(
    Queued.$match({
      Readable: ({ write, attempt, delayed }): OutboxItem => ({
        requestId: write.operation,
        mutation: Option.some(write.mutation),
        state:
          write.state._tag === 'Waiting'
            ? OutboxItemState.Waiting({ attempt, error: delayed })
            : OutboxItemState.Failed({ error: write.state.error }),
      }),
      Unreadable: ({ operation, raw, reason }): OutboxItem => ({
        requestId: operation,
        mutation: Option.map(
          Schema.decodeUnknownOption(MutationName)(raw),
          ({ mutation }) => mutation,
        ),
        state: OutboxItemState.Unreadable({ reason }),
      }),
    }),
  )
  return {
    waiting: items.filter(item => item.state._tag === 'Waiting').length,
    failed: items.filter(item => item.state._tag === 'Failed').length,
    items,
  }
}

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
