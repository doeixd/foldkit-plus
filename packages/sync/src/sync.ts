import {
  Effect,
  Exit,
  Metric,
  Option,
  PubSub,
  Queue,
  Ref,
  Result,
  Schema,
  Stream,
  SynchronizedRef,
} from 'effect'
import {
  AmbiguousMessageError,
  CheckpointRegressionError,
  CommittedOrderError,
  ForeignAcknowledgementError,
  ForeignRejectionError,
  InvalidExchangeError,
  InvalidOutboxError,
  InvalidReplicaHistoryError,
  ReplayError,
  ReplicaClosedError,
  ServerOnlyMessageError,
  UnreadableMessageError,
  UnsupportedMessageVersionError,
  UnsupportedReplicaVersionError,
  WrongReplicaStorageError,
  type ReplicaError,
} from './errors.js'
import { historyOf, migrations, type Migrations } from './migrations.js'
import type { Storage } from './indexedDb.js'
import {
  DocumentId,
  LocalSequence,
  OpId,
  ReplicaId,
  Sequence,
  localSequence,
  sequence,
} from './ids.js'
import { Transport, TransportError } from './transport.js'
import { Diagnostics } from 'foldkit-surface'
import { exchangeFailed, historyRebuilt, unknownRefusal } from './diagnostics.js'
import { fitWords, SyncRefusal } from './refusal.js'

/** Wire and persisted-format versions. A bump must handle the older value explicitly. */
const PROTOCOL_VERSION = 1
const SCHEMA_VERSION = 1

/**
 * Replica ids the server's own operations use (`foldkit-sync/journal`'s
 * `serverJournal`): a sent entry may not claim one, or it could bind the id to
 * its actor first and have the server's append refused.
 */
export const SERVER_REPLICA_PREFIX = 'server/'
/** The longest replica id a sent entry may name. A stored one is read whatever its length. */
const MAX_SENT_REPLICA_ID = 128

/**
 * A client-authored operation envelope. `message` is the application's
 * Message, encoded at the current version of the document's history.
 */
const OperationSchema = Schema.Struct({
  protocolVersion: Schema.Literal(PROTOCOL_VERSION),
  schemaVersion: Schema.Literal(SCHEMA_VERSION),
  documentId: DocumentId,
  replicaId: ReplicaId,
  localSequence: LocalSequence,
  opId: OpId,
  baseCursor: Sequence,
  message: Schema.Unknown,
})
export type Operation = typeof OperationSchema.Type

/**
 * An operation as it was written: what a replica keeps in its outbox and
 * sends, with its Message at the version it was written at. `messageVersion`
 * is absent for version 1, so a document with no migrations writes today's
 * envelope byte for byte.
 */
const WrittenFields = Schema.Struct({
  ...OperationSchema.fields,
  messageVersion: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))),
})
/** The written shape, unbranded: what the codec reads before it vouches for anything. */
type WrittenShape = typeof WrittenFields.Type
/**
 * Branded, so only Sync makes one: decoding an entry, or writing an
 * `Operation` at the current version (`journalContract().operation.encode`).
 * A decoded `Operation` is not one, since its missing `messageVersion` would
 * read as version 1 and be upcast again.
 */
const WrittenOperationSchema = WrittenFields.pipe(Schema.brand('foldkit-sync/WrittenOperation'))
export type WrittenOperation = typeof WrittenOperationSchema.Type
/** What the codec has checked or written itself. */
const vouched = (operation: WrittenShape): WrittenOperation => operation as WrittenOperation

const committedFields = {
  serverSequence: Sequence.check(Schema.isGreaterThanOrEqualTo(1)),
  actorId: Schema.NonEmptyString,
}
/** An operation the server committed, with its authoritative order and actor. */
const CommittedSchema = Schema.Struct({ ...OperationSchema.fields, ...committedFields })
/** Named to avoid colliding with `foldkit-durable`'s `Committed`. */
export type CommittedOperation = typeof CommittedSchema.Type
/**
 * A type-only mark on what `codec.committedFrom` returns. It reads its input as
 * history, so it skips the checks of a sent entry, and
 * `journalContract().operation.encode` refuses it, stripped of its commit or not.
 */
export interface ReadAsHistory {
  readonly '~foldkit-sync/history': true
}
/** A committed operation as the server sends it: written at the server's current version. */
const CommittedWrittenSchema = Schema.Struct({
  ...WrittenFields.fields,
  ...committedFields,
})

const decodeWritten = Schema.decodeUnknownSync(WrittenOperationSchema, {
  onExcessProperty: 'error',
})
/**
 * An envelope as written, checked for its shape and nothing else: for the
 * server's own operations (`serverJournal`), whose bytes it wrote or recorded.
 * Never for an entry someone sent.
 */
export const writtenEnvelope = (input: unknown): WrittenOperation => decodeWritten(input)
const decodeCommittedWritten = Schema.decodeUnknownSync(CommittedWrittenSchema, {
  onExcessProperty: 'error',
})
/** The version an operation was written at: absent is 1. */
const versionOf = (operation: WrittenShape): number => operation.messageVersion ?? 1
const decodeRefusal = Schema.decodeUnknownResult(SyncRefusal, { onExcessProperty: 'error' })

/**
 * How many committed-operation ids a replica retains for duplicate detection.
 * Committed sequences are contiguous and the server enforces `opId`
 * uniqueness, so this is defence in depth; bounding it keeps replica state from
 * growing without limit on a log that is never checkpointed.
 */
const COMMITTED_ID_WINDOW = 1024
/** How long `start` waits after a failed exchange: doubling from the base, up to the cap, in ms. */
const START_RETRY_BASE = 500
const START_RETRY_MAX = 30_000

/** Counters and a histogram an application can scrape. */
export const syncMetrics = {
  exchanges: Metric.counter('foldkit_sync_exchanges_total'),
  applied: Metric.counter('foldkit_sync_commits_applied_total'),
  checkpoints: Metric.counter('foldkit_sync_checkpoints_adopted_total'),
  exchangePending: Metric.histogram('foldkit_sync_exchange_pending', {
    boundaries: [1, 4, 16, 64, 256, 1024],
  }),
}

export interface Checkpoint<Shared> {
  readonly cursor: Sequence
  readonly model: Shared
}

export interface Exchange<Shared> {
  /** Server-committed operations as they arrived; validated against `CommittedOperation` on adoption. */
  readonly operations: ReadonlyArray<unknown>
  readonly rejected: ReadonlyArray<OpId>
  /**
   * Why some of `rejected` were refused, each an encoded `SyncRefusal`. One
   * without a refusal is still rejected.
   */
  readonly refusals?:
    | ReadonlyArray<{ readonly opId: OpId; readonly refusal: typeof SyncRefusal.Encoded }>
    | undefined
  /**
   * @deprecated Send `refusals`; removed in the next release. Words the server
   * chose for a person, for some of `rejected`.
   */
  readonly reasons?: ReadonlyArray<{ readonly opId: OpId; readonly reason: string }> | undefined
  /** Sends from the request that are durably committed, so the replica can drop them. */
  readonly acknowledged?: ReadonlyArray<OpId> | undefined
  /** The snapshot a replica predating compaction adopts in place of the log. */
  readonly checkpoint?: Checkpoint<Shared> | undefined
  /** The server sent only part of what is after the cursor; the replica asks again. */
  readonly more?: boolean | undefined
  /**
   * The identity of the server's history. The replica sends back the one it last saw; a
   * server that finds another answers from the start of its own history, and the replica,
   * seeing a new epoch, rebuilds its committed state from that answer and keeps its outbox.
   */
  readonly epoch?: string | undefined
}

export interface ReplicaState<Shared> {
  readonly protocolVersion: typeof PROTOCOL_VERSION
  readonly schemaVersion: typeof SCHEMA_VERSION
  readonly documentId: DocumentId
  readonly replicaId: ReplicaId
  readonly revision: number
  readonly nextLocalSequence: LocalSequence
  readonly cursor: Sequence
  readonly committed: Shared
  readonly committedIds: ReadonlyArray<string>
  /** Operations not yet committed, as written. */
  readonly pending: ReadonlyArray<WrittenOperation>
  /** Operations this build cannot read, kept as written until dismissed; absent when none. */
  readonly refused?: ReadonlyArray<WrittenOperation>
  /** The server history `cursor` points into, once an exchange has named one. */
  readonly epoch?: string
}

/**
 * What the promise-based edge adapter consumes; the Effect `Transport` service
 * is the primary seam.
 */
export interface TransportClient {
  /**
   * `epoch` is the server history the replica's cursor points into, when it
   * knows one. `pending` is unread, as on every transport seam: a server reads
   * each entry with `codec.writtenFrom`, which refuses what only it may append.
   */
  exchange(
    cursor: Sequence,
    pending: ReadonlyArray<unknown>,
    epoch?: string | undefined,
  ): Promise<unknown>
}

/** A redacted view of a replica's state, for a UI to explain and recover. */
export interface ReplicaStatus {
  readonly pending: number
  readonly cursor: Sequence
  /** The last exchange failure, cleared by a successful exchange. */
  readonly lastError: string | undefined
  /** Operations the server refused, most recent first, with its reason when it gave one. */
  readonly rejected: ReadonlyArray<Rejection>
  /**
   * Operations this build cannot read, as written: an older version of the
   * document's Message that no step of its history reads, found in the outbox
   * or refused by the server as `Unreadable`. Never sent; kept, with their
   * payload, until `Replica.dismiss`.
   */
  readonly refused: ReadonlyArray<WrittenOperation>
  /**
   * The server history the cursor points into, once a server named one. A new
   * one means the server was reset: what the replica had committed is gone.
   */
  readonly epoch: Option.Option<string>
}

/**
 * An operation the server refused, and why, when it said. It carries the
 * operation itself: the replica drops it from the outbox in the same step,
 * so what it changed can be read from here rather than looked up in time.
 */
export interface Rejection {
  readonly opId: OpId
  /**
   * Why, typed. None when the server named no refusal (an older or a custom
   * server), or one this build cannot read (reported as `UnknownRefusal`).
   */
  readonly refusal: Option.Option<SyncRefusal>
  /**
   * @deprecated Read `refusal`, through `SyncRefusal.match`; removed in the
   * next release. The server's words from its `reasons`.
   */
  readonly reason: Option.Option<string>
  /** The operation as it was sent: its Message at the version it was written at. */
  readonly operation: WrittenOperation
  /** The operation's Message, encoded at the current version: what to read it by. */
  readonly message: unknown
}

/**
 * A consistent status and optimistic-shared pair, read from one replica state.
 * `Replica.changes` emits it so a UI can hold a single subscription.
 */
export interface ReplicaSnapshot<Shared> {
  readonly status: ReplicaStatus
  readonly shared: Shared
  /** The server-confirmed state the optimistic `shared` is built on. */
  readonly committed: Shared
  /**
   * The local sequence the next submitted operation takes. Only a successful
   * submit moves it, so a caller that submits one Message at a time can tell
   * from one snapshot whether `shared` already holds it.
   */
  readonly nextLocalSequence: LocalSequence
}

export interface Replica<Message, Shared> {
  /** The id this replica's operations carry, one per tab: what its commits are stamped with. */
  readonly replicaId: ReplicaId
  /** The optimistic projection: committed state with pending operations replayed. */
  readonly shared: Effect.Effect<Shared>
  /**
   * The server-confirmed state through `cursor`, with no pending operation
   * applied. A pending edit reaches it only once the server commits it, and a
   * rejected one never does.
   */
  readonly committed: Effect.Effect<Shared>
  /** The outbox, as written. */
  readonly pending: Effect.Effect<ReadonlyArray<WrittenOperation>>
  readonly cursor: Effect.Effect<Sequence>
  /**
   * Waiting/recovery information without exposing Messages or the Model. It is a
   * snapshot; `statusChanges` re-emits it after every submit and exchange.
   */
  readonly status: Effect.Effect<ReplicaStatus>
  /** The status, re-emitted after every submit and exchange. */
  readonly statusChanges: Stream.Stream<ReplicaStatus>
  /**
   * The status and the optimistic shared value together, re-emitted after every
   * submit and exchange, so a UI can subscribe once instead of to both.
   */
  readonly changes: Stream.Stream<ReplicaSnapshot<Shared>>
  /** The status, `shared`, `committed` and next local sequence, read from one replica state. */
  readonly snapshot: Effect.Effect<ReplicaSnapshot<Shared>>
  /** Records a durable Message in the outbox and applies it optimistically. */
  // A method, so a replica of the durable subset is still a `Replica` of the
  // application's Messages where one is only passed along (`Sync.mount`).
  submit(message: Message): Effect.Effect<void, ReplicaError>
  /** Reconciles against the server. The `Transport` service must be provided. */
  readonly synchronize: Effect.Effect<void, ReplicaError | TransportError, Transport>
  /**
   * The exchange loop: exchanges once, then after every `submit` and every
   * notice on the transport's `changes`, until the replica closes or the fiber
   * is interrupted. A failed exchange is recorded
   * in `status.lastError` and retried on a backoff (from 0.5 s, doubling up to
   * 30 s), or at once on the next `submit`, so the fiber never fails. Fork it
   * with `Effect.forkScoped` and provide `Transport`.
   */
  readonly start: Effect.Effect<void, never, Transport>
  /** Forgets a `status.refused` operation, its payload with it. One that is not there changes nothing. */
  dismiss(opId: OpId): Effect.Effect<void, ReplicaError>
  readonly close: Effect.Effect<void>
}

/**
 * The document's Message: one Schema, at version 1, or its history
 * (`Sync.migrations`), whose current Schema is the Message.
 */
export type MessageHistory<Message, MessageEncoded> =
  | {
      readonly message: Schema.Codec<Message, MessageEncoded, never, never>
      readonly migrations?: undefined
    }
  | {
      /** The Schemas operations may be stored in, and how each becomes the next. */
      readonly migrations: Migrations<Message, MessageEncoded>
      readonly message?: undefined
    }

export type SyncDefinition<Message, Shared, MessageEncoded, SharedEncoded> = SyncDefinitionOptions<
  Message,
  Shared,
  SharedEncoded
> &
  MessageHistory<Message, MessageEncoded>

export interface SyncDefinitionOptions<Message, Shared, SharedEncoded> {
  readonly documentId: DocumentId
  readonly shared: Schema.Codec<Shared, SharedEncoded, never, never>
  readonly empty: Shared
  readonly durable: (message: Message) => boolean
  /**
   * Optional. The Messages only the server appends: stored and replayed like
   * durable ones, never accepted from a replica. A Message both predicates
   * accept is refused wherever it is read.
   */
  readonly serverOnly?: ((message: Message) => boolean) | undefined
  readonly replay: (shared: Shared, message: Message) => Shared
  /**
   * Optional. Merges a durable Message into the one submitted before it, while that one
   * has not been sent: one operation instead of two, for a burst of typing. Replaying the
   * result must equal replaying `last` then `next`. Undefined keeps them apart.
   */
  readonly coalesce?: ((last: Message, next: Message) => Message | undefined) | undefined
  /**
   * Optional. Writes what the server's commit decided into a durable Message, on the
   * server only: the journal stores, reduces and sends the stamped Message, so every
   * replica replays the same one in place of what it sent.
   */
  readonly stamp?: ((message: Message, commit: CommitStamp) => Message) | undefined
}

/**
 * What a commit decided, for `stamp`: the operation's place in the order, who
 * committed it, and from which replica. `actorId` is the principal, shared by
 * every tab a person has open; `replicaId` tells those tabs apart.
 */
export interface CommitStamp {
  readonly sequence: number
  readonly actorId: string
  readonly replicaId: string
}

/**
 * A document's protocol. `Durable` is what a replica's `submit` takes: the
 * durable subset for a contract from `Sync.forApplication(App).make`, every
 * Message for one from `Sync.define`, which checks `durable` when called.
 */
export interface Sync<Message, Shared, Durable = Message> {
  readonly documentId: DocumentId
  /** Whether a Message is one the replica records and replays. */
  readonly durable: (message: Message) => boolean
  /** Whether a Message is one only the server appends: replicas replay it and never submit it. */
  readonly serverOnly: (message: Message) => boolean
  /**
   * Low-level wire codecs for adapters and the transport. Most applications use
   * `journalContract` and `openReplica`; these are exposed for a custom
   * transport or a server that must speak the operation envelope directly.
   */
  readonly codec: {
    /** The current version of the document's Message history: 1 with no migrations. */
    readonly messageVersion: number
    /** The document's Message at its current version: what every hook decodes. */
    readonly message: Schema.Codec<Message, unknown, never, never>
    /**
     * An entry someone sent, read: its Message upcast to the current version.
     * Throws `UnsupportedMessageVersionError` for a newer version,
     * `UnreadableMessageError` for an older one no step reads, and
     * `ServerOnlyMessageError` for a Message only the server appends; it
     * refuses a replica id under `server/` or past 128 characters. Read
     * stored history with `journalContract().operation.decode`, which takes
     * the server's Messages too.
     */
    readonly normalizeOperation: (input: unknown) => Operation
    /** `normalizeOperation`, of this document only. */
    readonly operationFrom: (input: unknown, documentId: DocumentId) => Operation
    /**
     * An entry as received, checked as an envelope of this document and read
     * as `normalizeOperation` reads it, and returned as written: what a server
     * appends. A custom server reads every entry with it before appending.
     * Never pass it an `Operation`: that Message is already current and would
     * be read as version 1. Write one with `journalContract().operation.encode`.
     */
    readonly writtenFrom: (input: unknown, documentId: DocumentId) => WrittenOperation
    readonly committedFrom: (
      input: unknown,
      documentId: DocumentId,
    ) => CommittedOperation & ReadAsHistory
    readonly decodeExchange: (input: unknown) => Exchange<Shared>
  }
  /** The codecs and pure reducer `foldkit-durable`'s `makeJournal` consumes. */
  readonly journalContract: () => JournalContract<Operation, Shared>
  /**
   * Opens the replica a store holds. Its id is the store's: read back, or minted
   * when the store is empty, so two stores never share one. In a browser the
   * store is `Sync.tabStorage(name)`, one per tab.
   */
  readonly openReplica: (
    storage: Storage,
    options?: OpenReplicaOptions,
  ) => Effect.Effect<Replica<Durable, Shared>, ReplicaError>
}

export interface OpenReplicaOptions {
  /**
   * The id the store must hold, for a test asserting operation ids or a replica
   * a server names. It names one store, never a person: operation ids are
   * `replicaId:localSequence`, so two stores under one id (a person's second
   * browser) reuse ids the journal refuses.
   */
  readonly replicaId?: ReplicaId | undefined
}

/** Structural match for `foldkit-durable`'s journal options; Sync stays independent. */
export interface JournalContract<Operation, Shared> {
  /** The replica each operation came from, which Durable binds to its first committer. */
  readonly replicaId: (operation: Operation) => string
  /** Sync's operation id includes the replica, even after Durable compacts its payload. */
  readonly legacyReplicaId: (opId: string) => string
  readonly operation: {
    /** Written at the current version: what the journal stores. */
    readonly encode: (
      operation: Operation & { readonly '~foldkit-sync/history'?: never },
    ) => WrittenOperation
    /**
     * Read from any version the history has, upcast to the current one: stored
     * history, so the server's own Messages read too. Never the reader of an
     * entry someone sent (`codec.writtenFrom`).
     */
    readonly decode: (input: WrittenOperation) => Operation
    /**
     * What a retransmission is compared by: the operation normalized at the
     * version it was written at, as the build that wrote it normalized it, so
     * an edit committed before a deploy is still recognized after it. Only
     * hashed: never an entry to append.
     */
    readonly compared: (input: unknown) => unknown
  }
  readonly snapshot: {
    readonly encode: (snapshot: Shared) => unknown
    readonly decode: (input: unknown) => Shared
  }
  readonly empty: () => Shared
  readonly reduce: (snapshot: Shared, operation: Operation) => Shared
  /** Present when the definition stamps: Durable's `stamp`, over the operation's Message. */
  readonly stamp?: (
    operation: Operation,
    commit: { readonly sequence: number; readonly actorId: string },
  ) => Operation
}

/**
 * Binds the replicated-state protocol to one application contract.
 *
 * The returned codecs decide what is a valid operation and what the shared
 * projection means; the replica owns the local outbox, optimistic projection,
 * and reconciliation as Effects, and never runs a second reducer.
 */
export const defineSync = <Message, Shared, MessageEncoded, SharedEncoded>(
  definition: SyncDefinition<Message, Shared, MessageEncoded, SharedEncoded>,
): Sync<Message, Shared> => {
  const documentId = definition.documentId
  const messages = definition.migrations ?? migrations(definition.message)
  const history = historyOf(messages as Migrations<unknown, unknown>)
  const current = history.version
  const decodeMessage = Schema.decodeUnknownSync(messages.current, { onExcessProperty: 'error' })
  const encodeMessage = Schema.encodeSync(messages.current)
  const decodeShared = Schema.decodeUnknownSync(definition.shared, { onExcessProperty: 'error' })
  const encodeShared = Schema.encodeSync(definition.shared)

  const ReplicaStateSchema = Schema.Struct({
    protocolVersion: Schema.Literal(PROTOCOL_VERSION),
    schemaVersion: Schema.Literal(SCHEMA_VERSION),
    documentId: DocumentId,
    replicaId: ReplicaId,
    revision: Schema.Number,
    nextLocalSequence: LocalSequence,
    cursor: Sequence,
    committed: definition.shared,
    committedIds: Schema.Array(Schema.String),
    pending: Schema.Array(WrittenOperationSchema),
    refused: Schema.optionalKey(Schema.Array(WrittenOperationSchema)),
    epoch: Schema.optionalKey(Schema.NonEmptyString),
  })
  const CheckpointSchema = Schema.Struct({ cursor: Sequence, model: definition.shared })
  const ExchangeSchema = Schema.Struct({
    operations: Schema.Array(Schema.Unknown),
    rejected: Schema.Array(OpId),
    // Each refusal is decoded on its own, when the rejection is read: one this
    // build cannot read must not fail the exchange that rejected its operation.
    refusals: Schema.optional(Schema.Array(Schema.Struct({ opId: OpId, refusal: Schema.Unknown }))),
    // A server's words for a person, bounded: a reply is not a place for a document.
    reasons: Schema.optional(
      Schema.Array(
        Schema.Struct({ opId: OpId, reason: Schema.String.check(Schema.isMaxLength(500)) }),
      ),
    ),
    acknowledged: Schema.optional(Schema.Array(OpId)),
    checkpoint: Schema.optional(CheckpointSchema),
    more: Schema.optional(Schema.Boolean),
    epoch: Schema.optional(Schema.NonEmptyString),
  })
  const decodeState = Schema.decodeUnknownSync(ReplicaStateSchema, { onExcessProperty: 'error' })
  const encodeState = Schema.encodeSync(ReplicaStateSchema)
  const encodeWritten = Schema.encodeSync(WrittenOperationSchema)
  const VersionProbe = Schema.Struct({
    protocolVersion: Schema.optional(Schema.Number),
    schemaVersion: Schema.optional(Schema.Number),
  })
  /**
   * Tells a version this build does not understand apart from malformed data,
   * so the caller gets an actionable failure and the stored state is preserved.
   */
  const unsupportedVersion = (input: unknown): UnsupportedReplicaVersionError | undefined => {
    let found: {
      readonly protocolVersion?: number | undefined
      readonly schemaVersion?: number | undefined
    }
    try {
      found = Schema.decodeUnknownSync(VersionProbe)(input)
    } catch {
      return undefined
    }
    if (found.protocolVersion === PROTOCOL_VERSION && found.schemaVersion === SCHEMA_VERSION)
      return undefined
    const protocolVersion = found.protocolVersion ?? null
    const schemaVersion = found.schemaVersion ?? null
    return new UnsupportedReplicaVersionError({
      protocolVersion,
      schemaVersion,
      message: `Stored replica uses protocol ${protocolVersion ?? '?'} / schema ${schemaVersion ?? '?'}; this build supports ${PROTOCOL_VERSION}/${SCHEMA_VERSION}`,
    })
  }
  const decodeExchange = (input: unknown): Exchange<Shared> =>
    Schema.decodeUnknownSync(ExchangeSchema, { onExcessProperty: 'error' })(
      input,
    ) as Exchange<Shared>

  const checkIdentity = (operation: Operation): void => {
    // `LocalSequence` already rejects a non-positive counter; this checks the
    // derived identity.
    if (operation.opId !== `${operation.replicaId}:${operation.localSequence}`) {
      throw new Error('Invalid operation identity')
    }
  }
  /**
   * An operation's Message, upcast to the current version and decoded. The
   * durable check runs on the current Message, so a step that maps an old
   * variant onto a local-only one is refused as that one is.
   */
  const newer = (opId: string, version: number) =>
    new UnsupportedMessageVersionError({
      opId,
      found: version,
      supported: current,
      message: `Operation ${opId} was written at Message version ${version}; this build reads up to ${current}`,
    })
  const serverOnly = definition.serverOnly ?? (() => false)
  /**
   * `sent` is an entry someone sent, which may carry only what a replica
   * submits; `history` is what the journal stored, the server's Messages too.
   */
  const messageOf = (operation: WrittenShape, kind: 'sent' | 'history'): Message => {
    const version = versionOf(operation)
    if (version > current) throw newer(operation.opId, version)
    let decoded: Message
    if (version === current) decoded = decodeMessage(operation.message)
    else
      try {
        decoded = decodeMessage(history.upcast(version, operation.message))
      } catch (cause) {
        throw new UnreadableMessageError({
          opId: operation.opId,
          version,
          message: `No step of the Message history reads operation ${operation.opId}, written at version ${version}`,
          cause,
        })
      }
    const durable = definition.durable(decoded)
    const server = serverOnly(decoded)
    if (durable && server)
      throw new AmbiguousMessageError({
        opId: operation.opId,
        message: `Operation ${operation.opId} carries a Message both durable and server-only`,
      })
    if (server && kind === 'sent')
      throw new ServerOnlyMessageError({
        opId: operation.opId,
        message: `Operation ${operation.opId} carries a Message only the server appends`,
      })
    if (!durable && !server) throw new Error('Message is local-only')
    return decoded
  }
  /** The envelope alone: the decoded side holds no version, only the current Message. */
  const envelopeOf = <O extends WrittenShape>({
    messageVersion: _,
    ...envelope
  }: O): Omit<O, 'messageVersion'> => envelope
  /** Written at the current version, which an explicit 1 is not. */
  const write = (operation: Operation): WrittenOperation => {
    const envelope = envelopeOf(operation)
    return vouched(current === 1 ? envelope : { ...envelope, messageVersion: current })
  }
  const assertDocument = <O extends WrittenShape>(operation: O, key: DocumentId): O => {
    if (operation.documentId !== key) throw new Error('Wrong document')
    return operation
  }
  /** What a sent entry may not name: the server's replica ids, or one past the bound. */
  const checkSentReplica = (operation: WrittenShape): void => {
    if (operation.replicaId.startsWith(SERVER_REPLICA_PREFIX))
      throw new Error('The replica id is reserved for the server')
    if (operation.replicaId.length > MAX_SENT_REPLICA_ID)
      throw new Error('The replica id is too long')
  }
  const read = (written: WrittenShape, kind: 'sent' | 'history'): Operation => {
    checkIdentity(written)
    if (kind === 'sent') checkSentReplica(written)
    return { ...envelopeOf(written), message: encodeMessage(messageOf(written, kind)) }
  }
  const normalizeOperation = (input: unknown): Operation => read(decodeWritten(input), 'sent')
  const operationFrom = (input: unknown, key: DocumentId): Operation =>
    read(assertDocument(decodeWritten(input), key), 'sent')
  const writtenFrom = (input: unknown, key: DocumentId): WrittenOperation => {
    const written = assertDocument(decodeWritten(input), key)
    // Read for its checks and discarded: what is appended is what was sent.
    read(written, 'sent')
    return written
  }
  /** Stored history: the server's Messages read, and a stored replica id of any length. */
  const readStored = (input: unknown): Operation => read(decodeWritten(input), 'history')
  /** An outbox entry this replica wrote: history, since it may predate a deploy that moved its variant. */
  const storedFrom = (input: unknown, key: DocumentId): Operation =>
    read(assertDocument(decodeWritten(input), key), 'history')
  /**
   * A committed operation arrives with its message already encoded, so decode it
   * once for the contract check and hand it to `replay` instead of decoding and
   * re-encoding it on the way.
   */
  const decodeCommittedOperation = (
    input: unknown,
    key: DocumentId,
  ): { readonly committed: CommittedOperation; readonly message: Message } => {
    const written = assertDocument(decodeCommittedWritten(input), key)
    checkIdentity(written)
    const message = messageOf(written, 'history')
    return { committed: { ...envelopeOf(written), message: encodeMessage(message) }, message }
  }
  const committedFrom = (input: unknown, key: DocumentId): CommittedOperation & ReadAsHistory =>
    decodeCommittedOperation(input, key).committed as CommittedOperation & ReadAsHistory
  /**
   * Normalized at the version it was written at, with no upcast: what the
   * build that wrote it hashed. An explicit `messageVersion: 1` is dropped,
   * so it and an absent one compare alike. Not branded: it skips the checks
   * of a sent entry, so it must never reach `append`.
   */
  const compared = (input: unknown): WrittenShape => {
    const written = decodeWritten(input)
    const version = versionOf(written)
    if (version > current) throw newer(written.opId, version)
    const envelope = envelopeOf(written)
    return {
      ...envelope,
      ...(version === 1 ? {} : { messageVersion: version }),
      message: history.normalize(version, written.message),
    }
  }

  const journalContract = (): JournalContract<Operation, Shared> => ({
    replicaId: operation => operation.replicaId,
    legacyReplicaId: opId => opId.slice(0, opId.lastIndexOf(':')),
    // Stored written at the current version; read from any version the history has.
    operation: { encode: write, decode: readStored, compared },
    snapshot: { encode: encodeShared, decode: decodeShared },
    empty: () => definition.empty,
    reduce: (snapshot, operation) => definition.replay(snapshot, decodeMessage(operation.message)),
    ...(definition.stamp === undefined
      ? {}
      : {
          stamp: (
            operation: Operation,
            commit: { readonly sequence: number; readonly actorId: string },
          ): Operation => ({
            ...operation,
            message: encodeMessage(
              definition.stamp!(decodeMessage(operation.message), {
                ...commit,
                replicaId: operation.replicaId,
              }),
            ),
          }),
        }),
  })

  /** `state` with `refused` set; the key is absent when none is, so such a state is as before. */
  const withRefused = (
    { refused: _, ...state }: ReplicaState<Shared>,
    refused: ReadonlyArray<WrittenOperation>,
  ): ReplicaState<Shared> => (refused.length === 0 ? state : { ...state, refused })

  const optimistic = (state: ReplicaState<Shared>): Shared =>
    state.pending.reduce(
      (model, operation) => definition.replay(model, messageOf(operation, 'history')),
      state.committed,
    )

  const openReplica = Effect.fn('Sync.openReplica')(
    function* (storage: Storage, options?: OpenReplicaOptions) {
      const saved = yield* storage.load()
      const initial: ReplicaState<Shared> = {
        protocolVersion: PROTOCOL_VERSION,
        schemaVersion: SCHEMA_VERSION,
        documentId,
        replicaId: options?.replicaId ?? ReplicaId.make(crypto.randomUUID()),
        revision: 0,
        nextLocalSequence: localSequence(1),
        cursor: sequence(0),
        committed: definition.empty,
        committedIds: [],
        pending: [],
      }
      const state: ReplicaState<Shared> =
        saved === undefined
          ? initial
          : yield* Effect.try({
              try: () => decodeState(saved),
              catch: cause =>
                unsupportedVersion(saved) ??
                new InvalidReplicaHistoryError({
                  message: 'Stored replica state is invalid',
                  cause,
                }),
            })
      const replicaId = state.replicaId
      yield* Effect.annotateCurrentSpan({ documentId, replicaId })
      if (
        state.documentId !== documentId ||
        (options?.replicaId !== undefined && replicaId !== options.replicaId)
      )
        return yield* new WrongReplicaStorageError({
          documentId,
          replicaId: options?.replicaId ?? replicaId,
          message: 'The stored replica belongs to a different document or replica',
        })
      const committedIds = new Set(state.committedIds)
      if (state.nextLocalSequence < 1 || committedIds.size !== state.committedIds.length)
        return yield* new InvalidReplicaHistoryError({ message: 'Invalid replica history' })
      const pendingIds = new Set<string>()
      // Written at an older version no step reads: refused by its id, kept as
      // written, so the rest of the outbox opens and sends.
      const unreadable = new Set<WrittenOperation>()
      for (const pending of state.pending) {
        if (
          pending.replicaId !== replicaId ||
          pending.localSequence >= state.nextLocalSequence ||
          committedIds.has(pending.opId) ||
          pendingIds.has(pending.opId)
        )
          return yield* new InvalidOutboxError({ message: 'Invalid outbox' })
        pendingIds.add(pending.opId)
        try {
          storedFrom(pending, documentId)
        } catch (cause) {
          // A newer build wrote it: nothing is removed, and that build reads it.
          if (cause instanceof UnsupportedMessageVersionError) return yield* cause
          if (cause instanceof UnreadableMessageError) unreadable.add(pending)
          else return yield* new InvalidOutboxError({ message: 'Invalid outbox' })
        }
      }
      // Storage holds the schema's encoded side, so a transforming `shared`
      // codec round-trips: decode on load, encode before every save. Encoding
      // also rejects an invalid `empty` on first creation rather than at reload.
      const store = Effect.fn('Sync.store')(function* (
        next: ReplicaState<Shared>,
        expectedRevision: number | null,
      ) {
        const encoded = yield* Effect.try({
          try: () => encodeState(next),
          catch: cause =>
            new InvalidReplicaHistoryError({
              message: 'Could not encode the replica state',
              cause,
            }),
        })
        yield* storage.save(encoded, expectedRevision)
      })
      if (saved === undefined) yield* store(state, null)
      // The one write an open makes, under the loaded revision: a tab that
      // opened the same store meanwhile fails it as a conflict.
      const opened: ReplicaState<Shared> =
        unreadable.size === 0
          ? state
          : withRefused(
              {
                ...state,
                revision: state.revision + 1,
                pending: state.pending.filter(operation => !unreadable.has(operation)),
              },
              [...(state.refused ?? []), ...unreadable],
            )
      if (opened !== state) yield* store(opened, state.revision)

      const stateRef = yield* SynchronizedRef.make(opened)
      const closed = yield* Ref.make(false)
      const lastError = yield* Ref.make<string | undefined>(undefined)
      const rejectedOps = yield* Ref.make<ReadonlyArray<Rejection>>([])
      // Operations submitted since opening that no exchange has carried yet. Only these may
      // be coalesced: one that was sent may already be committed as it was.
      const unsent = yield* Ref.make<ReadonlySet<string>>(new Set())
      // One pending wake-up is enough: the loop exchanges the whole outbox.
      const wake = yield* Queue.sliding<void>(1)
      const statusSignals = yield* PubSub.sliding<void>(1)
      // The current value, then again after every change. Subscribed before the
      // first read, so a change made while a subscriber holds that value, or
      // between the read and the subscription, is still told.
      const following = <A>(read: Effect.Effect<A>): Stream.Stream<A> =>
        Stream.unwrap(
          Effect.map(PubSub.subscribe(statusSignals), signals =>
            Stream.concat(
              Stream.fromEffect(read),
              Stream.fromSubscription(signals).pipe(Stream.mapEffect(() => read)),
            ),
          ),
        )
      // The projection is pure over an immutable state, so a cached value is
      // reused until a write replaces the state object. A UI reads `shared` far
      // more often than it writes, and replaying a large outbox per read is
      // quadratic (see `bench/projection.bench.ts`).
      const projection = yield* Ref.make<
        { readonly state: ReplicaState<Shared>; readonly shared: Shared } | undefined
      >(undefined)
      const snapshot = Effect.fn('Sync.snapshot')(function* () {
        const current = yield* SynchronizedRef.get(stateRef)
        const cached = yield* Ref.get(projection)
        let projected: Shared
        if (cached !== undefined && cached.state === current) projected = cached.shared
        else {
          projected = optimistic(current)
          yield* Ref.set(projection, { state: current, shared: projected })
        }
        return {
          status: {
            pending: current.pending.length,
            cursor: current.cursor,
            lastError: yield* Ref.get(lastError),
            rejected: yield* Ref.get(rejectedOps),
            refused: current.refused ?? [],
            epoch: Option.fromUndefinedOr(current.epoch),
          },
          shared: projected,
          committed: current.committed,
          nextLocalSequence: current.nextLocalSequence,
        }
      })()
      const shared = Effect.map(snapshot, value => value.shared)
      const status = Effect.map(snapshot, value => value.status)

      // `SynchronizedRef.modifyEffect` installs the returned state itself, so
      // persisting must not also set the ref (that would re-enter the lock).
      const persist = (next: ReplicaState<Shared>, current: ReplicaState<Shared>) =>
        store(next, current.revision)

      const submit = Effect.fn('Sync.submit')(function* (message: Message) {
        yield* Effect.annotateCurrentSpan({ documentId, replicaId })
        const result = yield* SynchronizedRef.modifyEffect(stateRef, current =>
          Effect.gen(function* () {
            if (yield* Ref.get(closed))
              return yield* new ReplicaClosedError({ message: 'Replica is closed' })
            if (serverOnly(message))
              return yield* new InvalidOutboxError({
                message: 'Message is one only the server appends',
              })
            if (!definition.durable(message))
              return yield* new InvalidOutboxError({ message: 'Message is local-only' })
            const last = current.pending[current.pending.length - 1]
            const merged =
              last !== undefined &&
              definition.coalesce !== undefined &&
              (yield* Ref.get(unsent)).has(last.opId)
                ? definition.coalesce(messageOf(last, 'history'), message)
                : undefined
            if (merged !== undefined && !definition.durable(merged))
              return yield* new InvalidOutboxError({
                message: 'coalesce returned a local-only Message',
              })
            if (merged !== undefined && serverOnly(merged))
              return yield* new InvalidOutboxError({
                message: 'coalesce returned a Message only the server appends',
              })
            // A merged Message takes the place of the last operation, under its identity.
            const operation = yield* Effect.try({
              try: () =>
                write(
                  storedFrom(
                    write(
                      merged === undefined
                        ? {
                            protocolVersion: PROTOCOL_VERSION,
                            schemaVersion: SCHEMA_VERSION,
                            documentId,
                            replicaId,
                            localSequence: current.nextLocalSequence,
                            opId: OpId.make(`${replicaId}:${current.nextLocalSequence}`),
                            baseCursor: current.cursor,
                            message: encodeMessage(message),
                          }
                        : { ...envelopeOf(last!), message: encodeMessage(merged) },
                    ),
                    documentId,
                  ),
                ),
              catch: () => new InvalidOutboxError({ message: 'Invalid outbox' }),
            })
            // Replay before writing: a Message replay refuses can never be
            // applied, here or on another replica, so it must not reach the
            // outbox. The result is the next optimistic projection, so the
            // cache is seeded instead of replaying the outbox on the next read.
            // Rebuilding the projection replays the outbox, which can throw
            // too (an upgrade that changed `update` for a pending Message), so
            // it sits inside the same typed error as the new Message's replay.
            const cached = yield* Ref.get(projection)
            const replayed = yield* Effect.try({
              try: () =>
                definition.replay(
                  cached !== undefined && cached.state === current
                    ? cached.shared
                    : optimistic(current),
                  message,
                ),
              catch: cause =>
                new ReplayError({
                  message: cause instanceof Error ? cause.message : 'Replay failed',
                  cause,
                }),
            })
            // Validated and encoded by `persist`; decoding here would demand the
            // encoded side and break a transforming `shared` codec.
            // The sequence moves on a merge too, so every submit is visible in it; a gap
            // in local sequences is harmless.
            const next: ReplicaState<Shared> = {
              ...current,
              revision: current.revision + 1,
              nextLocalSequence: localSequence(current.nextLocalSequence + 1),
              pending: [
                ...(merged === undefined ? current.pending : current.pending.slice(0, -1)),
                operation,
              ],
            }
            // Only the new operation is written when the storage can append it.
            if (storage.append === undefined) yield* persist(next, current)
            else {
              const encoded = yield* Effect.try({
                try: () => encodeWritten(operation),
                catch: cause =>
                  new InvalidReplicaHistoryError({
                    message: 'Could not encode the operation',
                    cause,
                  }),
              })
              yield* storage.append(
                {
                  revision: next.revision,
                  nextLocalSequence: next.nextLocalSequence,
                  localSequence: operation.localSequence,
                  operation: encoded,
                },
                current.revision,
              )
            }
            yield* Ref.set(projection, { state: next, shared: replayed })
            yield* Ref.update(unsent, ids => new Set(ids).add(operation.opId))
            yield* Queue.offer(wake, undefined)
            return [undefined, next] as const
          }),
        )
        // Outside the lock, so a `statusChanges` subscriber reads the new state.
        yield* PubSub.publish(statusSignals, undefined)
        return result
      })

      /** One exchange; whether the server has more to send and this one made progress. */
      const exchangeOnce = Effect.fn('Sync.exchange')(function* () {
        yield* Effect.annotateCurrentSpan({ documentId })
        const transport = yield* Transport
        if (yield* Ref.get(closed))
          return yield* new ReplicaClosedError({ message: 'Replica is closed' })
        // Read under the lock, as a submit writes, so no submit can merge into an operation
        // between its being read here and its being marked sent.
        const sent = yield* SynchronizedRef.modifyEffect(stateRef, current =>
          Ref.update(unsent, ids => {
            const left = new Set(ids)
            for (const operation of current.pending) left.delete(operation.opId)
            return left
          }).pipe(Effect.as([current, current] as const)),
        )
        yield* Metric.update(syncMetrics.exchanges, 1)
        yield* Metric.update(syncMetrics.exchangePending, sent.pending.length)
        const response = yield* Effect.gen(function* () {
          const raw = yield* transport.exchange(sent.cursor, sent.pending, sent.epoch)
          // The response is untrusted: a malformed shape is a typed failure, not
          // a defect that escapes the declared error channel.
          return yield* Effect.try({
            try: () => decodeExchange(raw),
            catch: cause =>
              new InvalidExchangeError({ message: 'Invalid sync exchange response', cause }),
          })
        })
        const { restarted, refusals } = yield* SynchronizedRef.modifyEffect(stateRef, current =>
          Effect.gen(function* () {
            // A `close` during the exchange must not persist its result.
            if (yield* Ref.get(closed))
              return yield* new ReplicaClosedError({ message: 'Replica is closed' })
            // Another epoch means the server's history is not the one the cursor points
            // into (it was reset): the answer starts from its beginning, so the committed
            // state is rebuilt from it. The outbox is the user's intent and is kept.
            const restarted =
              response.epoch !== undefined &&
              current.epoch !== undefined &&
              response.epoch !== current.epoch
            if (restarted) yield* Diagnostics.report(historyRebuilt(documentId, replicaId))
            let cursor = restarted ? sequence(0) : current.cursor
            let committed = restarted ? definition.empty : current.committed
            // A checkpoint folds committed history into its snapshot, so the
            // retained id set starts over from it, as it does on a new epoch.
            const ids =
              response.checkpoint === undefined && !restarted
                ? new Set(current.committedIds)
                : new Set<string>()
            if (response.checkpoint !== undefined) {
              if (response.checkpoint.cursor < cursor)
                return yield* new CheckpointRegressionError({
                  cursor,
                  checkpointCursor: response.checkpoint.cursor,
                  message: 'Checkpoint is behind the replica',
                })
              committed = response.checkpoint.model
              cursor = response.checkpoint.cursor
              yield* Metric.update(syncMetrics.checkpoints, 1)
              yield* Effect.logDebug('sync checkpoint adopted', { documentId, replicaId, cursor })
            }
            const acknowledged = new Set(response.acknowledged ?? [])
            const rejected = new Set(response.rejected)
            const sentIds = new Set(sent.pending.map(operation => operation.opId))
            for (const id of acknowledged)
              if (!sentIds.has(id))
                return yield* new ForeignAcknowledgementError({
                  opId: id,
                  message: 'Server acknowledged an operation that was not sent',
                })
            for (const id of rejected) {
              if (!sentIds.has(id))
                return yield* new ForeignRejectionError({
                  opId: id,
                  message: 'Server rejected an operation that was not sent',
                })
              // An id cannot be both; removal would be ambiguous and a faulty
              // server must not be able to make a pending operation vanish.
              if (acknowledged.has(id))
                return yield* new ForeignAcknowledgementError({
                  opId: id,
                  message: 'Server both acknowledged and rejected an operation',
                })
            }
            for (const { opId } of [...(response.refusals ?? []), ...(response.reasons ?? [])])
              if (!rejected.has(opId))
                return yield* new ForeignRejectionError({
                  opId,
                  message: 'Server gave a reason for an operation it did not reject',
                })
            // One each, so there are no more to decode than operations it rejected.
            const refusing = new Set<string>()
            for (const { opId } of response.refusals ?? []) {
              if (refusing.has(opId))
                return yield* new ForeignRejectionError({
                  opId,
                  message: 'Server gave two refusals for one operation',
                })
              refusing.add(opId)
            }
            const refusals = (response.refusals ?? []).map(
              ({ opId, refusal }) => [opId, decodeRefusal(refusal)] as const,
            )
            // What the server could not read is kept, as this build cannot either
            // once their chains agree: never sent again, never lost.
            const unreadableIds = new Set(
              refusals.flatMap(([opId, refusal]) =>
                Result.match(refusal, {
                  onFailure: (): ReadonlyArray<OpId> => [],
                  onSuccess: SyncRefusal.match({
                    Forbidden: (): ReadonlyArray<OpId> => [],
                    Invalid: () => [],
                    Unreadable: () => [opId],
                  }),
                }),
              ),
            )
            let applied = 0
            for (const raw of response.operations) {
              const { committed: operation, message } = yield* Effect.try({
                try: () => decodeCommittedOperation(raw, documentId),
                catch: cause =>
                  cause instanceof UnsupportedMessageVersionError
                    ? cause
                    : new InvalidReplicaHistoryError({
                        message: 'Invalid committed operation',
                        cause,
                      }),
              })
              if (operation.serverSequence <= cursor) continue
              if (operation.serverSequence !== cursor + 1 || ids.has(operation.opId))
                return yield* new CommittedOrderError({
                  expected: cursor + 1,
                  actual: operation.serverSequence,
                  message: 'Invalid committed order',
                })
              // A throw here would be a defect, which bypasses `lastError` and leaves
              // `start` retrying the same page in silence.
              const replaying = committed
              committed = yield* Effect.try({
                try: () => definition.replay(replaying, message),
                catch: cause =>
                  new ReplayError({
                    message: cause instanceof Error ? cause.message : 'Replay failed',
                    cause,
                  }),
              })
              ids.add(operation.opId)
              cursor = operation.serverSequence
              applied += 1
            }
            if (applied > 0) yield* Metric.update(syncMetrics.applied, applied)
            // Validated and encoded by `persist`, for the same reason as submit.
            const epoch = response.epoch ?? current.epoch
            const next = withRefused(
              {
                ...current,
                revision: current.revision + 1,
                committed,
                cursor,
                ...(epoch === undefined ? {} : { epoch }),
                committedIds: [...ids].slice(-COMMITTED_ID_WINDOW),
                // While the server has more to send, an acknowledged operation's committed
                // copy may be on a later page, so it stays in the optimistic view until then.
                // An acknowledged operation the replica is already past (committed before a
                // checkpoint, say) never arrives, so it goes once there is no more to read.
                pending: current.pending.filter(
                  operation =>
                    !ids.has(operation.opId) &&
                    !(acknowledged.has(operation.opId) && response.more !== true) &&
                    !rejected.has(operation.opId),
                ),
              },
              [
                ...(current.refused ?? []),
                // A refusal names only a rejected id (anything else failed the
                // exchange above), so what moves here has left `pending`.
                ...current.pending.filter(operation => unreadableIds.has(operation.opId)),
              ],
            )
            yield* persist(next, current)
            return [{ restarted, refusals }, next] as const
          }),
        )
        yield* Ref.set(lastError, undefined)
        if (response.rejected.length > 0) {
          const reasonOf = new Map(
            (response.reasons ?? []).map(({ opId, reason }) => [opId, reason] as const),
          )
          const refusalOf = new Map<string, SyncRefusal>()
          for (const [opId, decoded] of refusals) {
            if (Result.isSuccess(decoded)) refusalOf.set(opId, decoded.success)
            else
              yield* Diagnostics.report(
                unknownRefusal(documentId, replicaId, opId, fitWords(decoded.failure.message)),
              )
          }
          // Every rejected id was sent: an unknown one failed the exchange above.
          const sentOf = new Map(
            sent.pending.map(operation => [operation.opId, operation] as const),
          )
          // Every pending operation reads: one that did not was refused on open.
          const refused = response.rejected.map((opId): Rejection => {
            const operation = sentOf.get(opId)!
            return {
              opId,
              refusal: Option.fromUndefinedOr(refusalOf.get(opId)),
              reason: Option.fromUndefinedOr(reasonOf.get(opId)),
              operation,
              message: encodeMessage(messageOf(operation, 'history')),
            }
          })
          yield* Ref.update(rejectedOps, previous => [...refused, ...previous].slice(0, 32))
        }
        yield* PubSub.publish(statusSignals, undefined)
        const reached = (yield* SynchronizedRef.get(stateRef)).cursor
        return response.more === true && reached > (restarted ? 0 : sent.cursor)
      })

      // A server that pages its answer says there is more, and the replica asks again at
      // once; a round that moves the cursor nowhere ends it.
      const synchronize = Effect.gen(function* () {
        while (yield* exchangeOnce()) {}
      }).pipe(
        Effect.withSpan('Sync.synchronize'),
        // Any failed exchange, a refused response included, is what a UI shows,
        // so it is recorded and announced rather than left for the next submit.
        Effect.tapError(error =>
          Effect.gen(function* () {
            yield* Diagnostics.report(exchangeFailed(documentId, replicaId, error))
            yield* Ref.set(lastError, error.message)
            yield* PubSub.publish(statusSignals, undefined)
          }),
        ),
      )

      const start: Effect.Effect<void, never, Transport> = Effect.gen(function* () {
        const transport = yield* Transport
        // A server's notice wakes the loop as a submit does; the fiber ends with this one.
        // It starts at once so it is subscribed before the first exchange, which a
        // notice may arrive during.
        if (transport.changes !== undefined)
          yield* Effect.forkChild(
            Stream.runForEach(transport.changes, () => Queue.offer(wake, undefined)),
            { startImmediately: true },
          )
        let failures = 0
        while (!(yield* Ref.get(closed))) {
          const exit = yield* Effect.exit(synchronize)
          if (yield* Ref.get(closed)) return
          yield* Exit.match(exit, {
            onSuccess: () => {
              failures = 0
              return Queue.take(wake)
            },
            onFailure: () => {
              // Retried on a backoff, or sooner on a submit: an outbox must not
              // wait for the next keystroke to be delivered.
              failures += 1
              const backoff = Math.min(
                START_RETRY_MAX,
                START_RETRY_BASE * 2 ** Math.min(failures - 1, 16),
              )
              return Effect.raceFirst(Queue.take(wake), Effect.sleep(backoff))
            },
          })
        }
      })

      const dismiss = Effect.fn('Sync.dismiss')(function* (opId: OpId) {
        const dismissed = yield* SynchronizedRef.modifyEffect(stateRef, current =>
          Effect.gen(function* () {
            if (yield* Ref.get(closed))
              return yield* new ReplicaClosedError({ message: 'Replica is closed' })
            const refused = current.refused ?? []
            const left = refused.filter(operation => operation.opId !== opId)
            if (left.length === refused.length) return [false, current] as const
            const next = withRefused({ ...current, revision: current.revision + 1 }, left)
            yield* persist(next, current)
            return [true, next] as const
          }),
        )
        if (dismissed) yield* PubSub.publish(statusSignals, undefined)
      })

      return {
        replicaId,
        shared,
        snapshot,
        committed: Effect.map(SynchronizedRef.get(stateRef), state => state.committed),
        pending: Effect.map(SynchronizedRef.get(stateRef), state => state.pending),
        cursor: Effect.map(SynchronizedRef.get(stateRef), state => state.cursor),
        status,
        statusChanges: following(status),
        changes: following(snapshot),
        submit,
        synchronize,
        start,
        dismiss,
        close: Effect.fn('Sync.close')(function* () {
          yield* Ref.set(closed, true)
          // Wake `start` so it can observe `closed` and return.
          yield* Queue.offer(wake, undefined)
          yield* storage.close
        })(),
      }
    },
    (effect, storage) =>
      // Close a partially initialized storage on any failure, including a
      // defect, so a failed open cannot leak the connection.
      effect.pipe(
        Effect.onExit(exit =>
          Exit.isSuccess(exit) ? Effect.void : storage.close.pipe(Effect.ignore),
        ),
      ),
  )

  return {
    documentId,
    durable: definition.durable,
    serverOnly,
    codec: {
      messageVersion: current,
      message: messages.current as Schema.Codec<Message, unknown, never, never>,
      normalizeOperation,
      operationFrom,
      writtenFrom,
      committedFrom,
      decodeExchange,
    },
    journalContract,
    openReplica,
  }
}
