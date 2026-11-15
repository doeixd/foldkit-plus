import { Schema } from 'effect'

/** The persisted storage could not be read or written. */
export class StorageError extends Schema.TaggedError<StorageError>()('StorageError', {
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}

/** The stored clock state targets a schema version this build does not support. */
export class UnsupportedClockVersionError extends Schema.TaggedError<UnsupportedClockVersionError>()(
  'UnsupportedClockVersionError',
  {
    schemaVersion: Schema.NullOr(Schema.Number),
    message: Schema.String,
  },
) {}

/** The storage holds a different replica's state. */
export class WrongReplicaStorageError extends Schema.TaggedError<WrongReplicaStorageError>()(
  'WrongReplicaStorageError',
  {
    documentId: Schema.String,
    replicaId: Schema.String,
    message: Schema.String,
  },
) {}

/** The persisted replica history is internally inconsistent. */
export class InvalidReplicaHistoryError extends Schema.TaggedError<InvalidReplicaHistoryError>()(
  'InvalidReplicaHistoryError',
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {}

/** The server's exchange response did not match the protocol schema. */
export class InvalidExchangeError extends Schema.TaggedError<InvalidExchangeError>()(
  'InvalidExchangeError',
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {}

/** A persisted pending operation could not have been produced by this replica. */
export class InvalidOutboxError extends Schema.TaggedError<InvalidOutboxError>()(
  'InvalidOutboxError',
  {
    message: Schema.String,
  },
) {}

/** The server sent a checkpoint older than the replica's cursor. */
export class CheckpointRegressionError extends Schema.TaggedError<CheckpointRegressionError>()(
  'CheckpointRegressionError',
  {
    cursor: Schema.Number,
    checkpointCursor: Schema.Number,
    message: Schema.String,
  },
) {}

/** Committed operations were not contiguous from the replica's cursor. */
export class CommittedOrderError extends Schema.TaggedError<CommittedOrderError>()(
  'CommittedOrderError',
  {
    expected: Schema.Number,
    actual: Schema.Number,
    message: Schema.String,
  },
) {}

/** The server rejected an operation the replica never sent. */
export class ForeignRejectionError extends Schema.TaggedError<ForeignRejectionError>()(
  'ForeignRejectionError',
  {
    opId: Schema.String,
    message: Schema.String,
  },
) {}

/**
 * The server answered an operation this request never sent, or both
 * acknowledged and rejected it. Acting on either would let a faulty or hostile
 * server delete local work.
 */
export class ForeignAcknowledgementError extends Schema.TaggedError<ForeignAcknowledgementError>()(
  'ForeignAcknowledgementError',
  {
    opId: Schema.String,
    message: Schema.String,
  },
) {}

/** The replica was closed while work was still being submitted. */
export class ReplicaClosedError extends Schema.TaggedError<ReplicaClosedError>()(
  'ReplicaClosedError',
  {
    message: Schema.String,
  },
) {}

/** The stored replica state targets a protocol or schema version this build does not support. */
export class UnsupportedReplicaVersionError extends Schema.TaggedError<UnsupportedReplicaVersionError>()(
  'UnsupportedReplicaVersionError',
  {
    protocolVersion: Schema.NullOr(Schema.Number),
    schemaVersion: Schema.NullOr(Schema.Number),
    message: Schema.String,
  },
) {}

/**
 * An operation was written at a Message version above this build's: a newer
 * build wrote it. Nothing is removed; a build that has the version reads it.
 * The replica refuses to open on one in its outbox, and an exchange fails on
 * one the server committed: this client is older than its server, and reads
 * the document once it runs the new build.
 */
export class UnsupportedMessageVersionError extends Schema.TaggedError<UnsupportedMessageVersionError>()(
  'UnsupportedMessageVersionError',
  {
    opId: Schema.String,
    /** The version the operation was written at. */
    found: Schema.Number,
    /** The newest version this build reads. */
    supported: Schema.Number,
    message: Schema.String,
  },
) {}

/**
 * An operation written at an older Message version that no step of the
 * history reads: a step's Schema refused it, or its `up` threw. Thrown by
 * Sync's operation codec; a replica moves such a pending operation to
 * `refused`, and `journalExchange` rejects one as `Unreadable`.
 */
export class UnreadableMessageError extends Schema.TaggedError<UnreadableMessageError>()(
  'UnreadableMessageError',
  {
    opId: Schema.String,
    version: Schema.Number,
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {}

/**
 * A sent entry carries a Message only the server appends (`serverOnly`),
 * judged after upcasting. Thrown by every reader of an entry someone sent
 * (`codec.writtenFrom`, `normalizeOperation`, `operationFrom`);
 * `journalExchange` rejects it as `Forbidden`. History reads it.
 */
export class ServerOnlyMessageError extends Schema.TaggedError<ServerOnlyMessageError>()(
  'ServerOnlyMessageError',
  {
    opId: Schema.String,
    message: Schema.String,
  },
) {}

/**
 * A Message both `durable` and `serverOnly` accept: `Sync.define`'s two
 * predicates overlap, which cannot be told when they are given. It is refused
 * wherever it is read, never treated as either.
 */
export class AmbiguousMessageError extends Schema.TaggedError<AmbiguousMessageError>()(
  'AmbiguousMessageError',
  {
    opId: Schema.String,
    message: Schema.String,
  },
) {}

/**
 * `appendAsServer` was given a key already used for another Message: the
 * first fact stands, and nothing was appended.
 */
export class ServerKeyReusedError extends Schema.TaggedError<ServerKeyReusedError>()(
  'SyncServerKeyReusedError',
  { key: Schema.String },
) {
  override get message(): string {
    return `The server key "${this.key}" was already used for another Message`
  }
}

/**
 * `retry` was given a run parked in a history since reset: its sequence names
 * whatever the new history committed there. Dismiss it; if its operation is
 * sent again, it commits and is reacted to in the new history.
 */
export class StaleParkedRunError extends Schema.TaggedError<StaleParkedRunError>()(
  'SyncStaleParkedRunError',
  { reaction: Schema.String, opId: Schema.String },
) {
  override get message(): string {
    return `The run of ${this.reaction} at ${this.opId} was parked before the document was reset`
  }
}

/**
 * A committed operation of the document will not read: written at a version
 * this server's history lacks, or at one no step reads. The journal reads a
 * stored row only when it needs it, so this fails what needs that row: an
 * exchange from a replica whose cursor is before it (after appending what
 * that replica sent, which commits, and is acknowledged on a retry once a
 * build reads the row), a retransmission of its id, and, while the row is
 * after the stored snapshot, every append and load of the document. A
 * replica past the row is served. Other documents are not affected.
 * Server-side only: its fields are for the server's logs, and its message,
 * which a socket sends, names neither.
 */
export class UnreadableHistoryError extends Schema.TaggedError<UnreadableHistoryError>()(
  'UnreadableHistoryError',
  {
    documentId: Schema.String,
    opId: Schema.String,
    version: Schema.Number,
    message: Schema.String,
  },
) {}

/**
 * `replay` threw for a submitted Message, or a law threw over its result, so
 * it could never be applied here or on any other replica; nothing was written.
 */
export class ReplayError extends Schema.TaggedError<ReplayError>()('ReplayError', {
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}

/**
 * `submit` replayed the Message over the optimistic snapshot, and the result
 * breaks one of the document's laws: nothing was written. A hint, not the
 * verdict: the optimistic snapshot holds pending edits the server may refuse,
 * and the server judges again over the snapshot it commits on.
 */
export class LawBrokenError extends Schema.TaggedError<LawBrokenError>()('LawBrokenError', {
  /** The law's id, as declared in `laws`. */
  rule: Schema.String,
  message: Schema.String,
  path: Schema.Array(Schema.String),
}) {}

export type ReplicaError =
  | StorageError
  | ReplayError
  | LawBrokenError
  | WrongReplicaStorageError
  | InvalidReplicaHistoryError
  | InvalidExchangeError
  | UnsupportedReplicaVersionError
  | UnsupportedMessageVersionError
  | InvalidOutboxError
  | CheckpointRegressionError
  | CommittedOrderError
  | ForeignRejectionError
  | ForeignAcknowledgementError
  | ReplicaClosedError
