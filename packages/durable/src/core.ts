/**
 * `foldkit-durable/core`: the journal over any `effect/sql` SQLite client,
 * without Node's driver, for a browser (`@effect/sql-sqlite-wasm`) or any
 * other runtime. `makeJournalOn(options)` opens it over the `SqlClient` in
 * context; the package's main entry adds `Journal.make` over a `node:sqlite`
 * file.
 */
export { Codec, type CodecInput } from './codec.js'
export {
  ActorId,
  Cursor,
  DocumentId,
  OpId,
  Sequence,
  actorId,
  cursor,
  documentId,
  opId,
  sequence,
} from './ids.js'
export {
  CompactedCursorError,
  EffectFailedError,
  IdentityConflictError,
  InvalidCompactionError,
  InvalidCursorError,
  InvalidOperationError,
  JournalError,
  OperationRejectedError,
  UnsupportedJournalVersionError,
} from './errors.js'
export {
  journalMetrics,
  makeJournalOn,
  type AppendError,
  type AppendResult,
  type AuthorizationDecision,
  type AuthorizationRequest,
  type Committed,
  type EffectRecord,
  type EffectStatus,
  type Journal,
  type JournalStoreOptions,
  type RecoveryIntent,
  type RecoveryOptions,
  type ValidationRequest,
} from './journal.js'
