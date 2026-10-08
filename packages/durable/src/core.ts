/**
 * `foldkit-durable/core`: the journal over any `effect/sql` SQLite client,
 * without Node's driver, for a browser (`@effect/sql-sqlite-wasm`), D1
 * (`@effect/sql-d1`, with `d1: true`), or any other runtime.
 * `Journal.layer(options)` is the journal as a layer that
 * needs the `SqlClient`; the package's main entry adds `Journal.make` over a
 * `node:sqlite` file.
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
export { Journal, JournalService, type JournalDefinition } from './service.js'
export {
  journalMetrics,
  type AppendError,
  type AppendResult,
  type AuthorizationDecision,
  type AuthorizationRequest,
  type Committed,
  type EffectRecord,
  type EffectStatus,
  type JournalStoreOptions,
  type RecoveryIntent,
  type RecoveryOptions,
  type ValidationRequest,
} from './journal.js'
