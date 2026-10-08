import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'
import {
  Config,
  Deferred,
  Effect,
  Exit,
  Metric,
  Option,
  PubSub,
  Result,
  Schedule,
  Stream,
  SynchronizedRef,
  type Scope,
} from 'effect'
import { SqlClient } from 'effect/sql'
import type { SqlError } from 'effect/sql/SqlError'
import { resolveCodec, type Codec, type CodecInput } from './codec.js'
import {
  actorId as toActorId,
  cursor as toCursor,
  documentId as toDocumentId,
  opId as toOpId,
  sequence as toSequence,
  type ActorId,
  type Cursor,
  type DocumentId,
  type OpId,
  type Sequence,
} from './ids.js'
import {
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

const SCHEMA_VERSION = 6
/** How many documents' states a journal keeps decoded in memory. */
const CACHED_DOCUMENTS = 256

/** Counters an application can scrape; the default registry already collects them. */
export const journalMetrics = {
  appends: Metric.counter('foldkit_durable_appends_total'),
  compactions: Metric.counter('foldkit_durable_compactions_total'),
  /** Owner runs only; a joined or recorded call is counted as coalesced instead. */
  effectRuns: Metric.counter('foldkit_durable_effect_runs_total'),
  effectRunsCoalesced: Metric.counter('foldkit_durable_effect_runs_coalesced_total'),
}

/** An operation as the journal committed it, with its authoritative order and actor. */
export interface Committed<Operation> {
  readonly operation: Operation
  readonly opId: OpId
  readonly sequence: Sequence
  readonly actorId: ActorId
}

/** Structural checks that run before a commit and throw when the operation is invalid. */
export interface ValidationRequest<Operation, Snapshot, Principal> {
  readonly key: DocumentId
  readonly principal: Principal
  readonly operation: Operation
  readonly snapshot: Snapshot
  readonly cursor: number
}

/** The application's policy decision for an operation, against the authoritative snapshot. */
export interface AuthorizationRequest<Operation, Snapshot, Principal> {
  readonly key: DocumentId
  readonly principal: Principal
  readonly operation: Operation
  readonly snapshot: Snapshot
}

export interface JournalOptions<
  Operation,
  Snapshot,
  Principal,
  OperationEncoded = unknown,
  SnapshotEncoded = unknown,
> {
  /**
   * A `node:sqlite` path, or `:memory:`. A `Config` lets an application supply
   * the path as a layer instead of a literal.
   */
  readonly file: string | Config.Config<string>
  /** An Effect `Schema.Codec`, or a pair of throwing `encode`/`decode` functions. */
  readonly operation: CodecInput<Operation, OperationEncoded>
  readonly snapshot: CodecInput<Snapshot, SnapshotEncoded>
  readonly empty: () => Snapshot
  /** Deterministic and fast: it runs inside the append transaction. */
  readonly reduce: (snapshot: Snapshot, operation: Operation) => Snapshot
  /**
   * Writes what the commit decided into the operation: its sequence and actor,
   * which the client that sent it cannot know. Runs inside the append
   * transaction after `validate` and `authorize`, before `reduce`, and must keep
   * the operation's identity. The stamped operation is what is stored, reduced,
   * read and recovered; a retry is still recognized by what was sent.
   */
  readonly stamp?: (
    operation: Operation,
    commit: { readonly sequence: Sequence; readonly actorId: ActorId },
  ) => Operation
  /** Stable identity; a repeat is answered idempotently. */
  readonly opId: (operation: Operation) => OpId
  /** The trusted actor recorded for the commit. */
  readonly actorId: (principal: Principal) => ActorId
  /**
   * Structural checks, run inside the append transaction before `authorize`.
   * Throw, or return an `Effect` that fails with `InvalidOperationError`. Like
   * `authorize` it holds the write lock, so it has no service requirement and
   * must stay local to the snapshot. On D1 (`d1: true`) there is no lock: it
   * sees the latest committed snapshot, and a concurrent commit retries.
   */
  readonly validate?: (
    request: ValidationRequest<Operation, Snapshot, Principal>,
  ) => void | Effect.Effect<void, InvalidOperationError>
  /**
   * Policy decision, run inside the append transaction. Return a `boolean`, a
   * refusal carrying its reason, or an `Effect` when the decision needs to
   * suspend. A service requirement is not available: the decision runs while
   * the write lock is held, so keep it local to the snapshot and fail with
   * `JournalError`. On D1 (`d1: true`) there is no lock; route appends
   * through one writer when the policy must see every commit in order.
   */
  readonly authorize?: (
    request: AuthorizationRequest<Operation, Snapshot, Principal>,
  ) => AuthorizationDecision | Effect.Effect<AuthorizationDecision, JournalError>
  /**
   * How many commits pass between writes of the snapshot; `load` replays the
   * operations since the last one. Default 1, a write per commit. A larger value
   * trades a short replay on load for not encoding a large snapshot per append.
   * The journal keeps the snapshot in memory either way, so an append decodes it
   * only after another connection changed the document.
   */
  readonly snapshotEvery?: number
  /**
   * The replica an operation came from, when operations carry one. The first commit from a
   * replica binds it to the committing actor, per document, and an operation from that
   * replica by any other actor is refused (`OperationRejectedError`) before `validate`
   * runs, so the replica a committed operation names is one its actor holds. The first
   * actor to use an id claims it, so ids should be unguessable or assigned per actor.
   */
  readonly replicaId?: (operation: Operation) => string
  /**
   * Pass `d1: true` when the `SqlClient` is Cloudflare D1. D1 has no
   * transactions, refuses `PRAGMA user_version` and `VACUUM`, and runs each
   * statement on its own: the schema version lives in a `durable_meta` table,
   * commits retry on constraint conflicts, `vacuum` is a no-op (D1
   * auto-vacuums), and reads are separate statements. Route appends through
   * one writer (a Durable Object): concurrent writers stay safe through the
   * uniqueness constraints, but `validate` and `authorize` then see the
   * latest committed snapshot rather than one held under a write lock.
   */
  readonly d1?: true | undefined
  /**
   * Recovers a replica from the id of a compacted operation written before schema 6.
   * Required to enable `replicaId` on such a journal: its payload is gone, so the
   * operation cannot be decoded. The journal refuses to open rather than let another
   * actor claim an unrecognized replica.
   */
  readonly legacyReplicaId?: (opId: OpId) => string
}

/** `JournalOptions` without the file: the store is the `SqlClient` the core `Journal.layer` is given. */
export type JournalStoreOptions<
  Operation,
  Snapshot,
  Principal,
  OperationEncoded = unknown,
  SnapshotEncoded = unknown,
> = Omit<JournalOptions<Operation, Snapshot, Principal, OperationEncoded, SnapshotEncoded>, 'file'>

/**
 * What `authorize` answers. `true` allows and `false` refuses; the object form
 * refuses with the rule's own reason, which reaches the caller on
 * `OperationRejectedError.reason`.
 */
export type AuthorizationDecision = boolean | { readonly allowed: false; readonly reason: string }

export type EffectStatus = 'pending' | 'succeeded' | 'failed'

/** The durable record of one externally visible effect. */
export interface EffectRecord {
  readonly key: string
  readonly status: EffectStatus
  readonly result?: unknown
  readonly error?: string
}

/** One effect a committed operation requires. `key` must be stable across restarts. */
export interface RecoveryIntent {
  readonly key: string
  readonly run: Effect.Effect<unknown, unknown>
}

export interface RecoveryOptions<Operation> {
  readonly key: DocumentId
  /** The application's recovery cursor; operations at or before it are settled. */
  readonly from: Cursor
  /** The effect intents an operation declares, in the order they must run. */
  readonly intents: (operation: Operation) => ReadonlyArray<RecoveryIntent>
  /**
   * Whether to retry an unresolved intent, or skip it and stop advancing. Defaults
   * to `retry`; use `skip` for an intent awaiting manual resolution.
   */
  readonly onUnresolved?: (
    intent: RecoveryIntent,
    record: Option.Option<EffectRecord>,
  ) => 'retry' | 'skip'
}

export type AppendError =
  InvalidOperationError | OperationRejectedError | IdentityConflictError | JournalError

/**
 * The outcome of `append`. `AlreadyCommitted` means the operation is known but
 * its payload was compacted away, so no `Committed` operation can be returned;
 * a caller must not treat the retransmitted content as the committed one.
 */
export type AppendResult<Operation> =
  | { readonly _tag: 'Committed'; readonly committed: Committed<Operation> }
  | {
      readonly _tag: 'AlreadyCommitted'
      readonly opId: OpId
      readonly sequence: Sequence
      readonly actorId: ActorId
    }

export interface Journal<Operation, Snapshot, Principal, OperationEncoded = unknown> {
  readonly load: (
    key: DocumentId,
  ) => Effect.Effect<{ readonly snapshot: Snapshot; readonly cursor: Cursor }, JournalError>
  /**
   * The sequence of the document's last commit; `0` if none. Unlike `load`, it
   * decodes nothing, so an exchange can check a client's cursor before it
   * appends anything.
   */
  readonly cursor: (key: DocumentId) => Effect.Effect<Cursor, JournalError>
  /**
   * The identity of the document's history: the same while its operations are kept, new
   * after `reset` or on a new database file. A client that saw another epoch holds a
   * cursor into history this journal does not have, and must start again from `0`.
   */
  readonly epoch: (key: DocumentId) => Effect.Effect<string, JournalError>
  /** The highest sequence whose payload has been compacted away; `0` if none. */
  readonly floor: (key: DocumentId) => Effect.Effect<Sequence, JournalError>
  /**
   * The committed operations after `after`, in order: at most `limit` of them when
   * given, so a caller far behind can catch up in bounded steps.
   */
  readonly read: (
    key: DocumentId,
    after: Cursor,
    options?: { readonly limit?: number },
  ) => Effect.Effect<
    ReadonlyArray<Committed<Operation>>,
    InvalidCursorError | CompactedCursorError | JournalError
  >
  /**
   * Commits an operation. A repeat of a known `opId` returns `Committed` with the
   * stored operation while its payload is retained, and `AlreadyCommitted`
   * without one once compaction has removed it. A reuse with different data or
   * actor is an `IdentityConflictError` in either case, proven by a retained
   * payload hash.
   */
  readonly append: (
    key: DocumentId,
    input: OperationEncoded,
    principal: Principal,
  ) => Effect.Effect<AppendResult<Operation>, AppendError>
  /** Commits several operations in order, in one transaction. */
  readonly appendAll: (
    key: DocumentId,
    inputs: ReadonlyArray<OperationEncoded>,
    principal: Principal,
  ) => Effect.Effect<ReadonlyArray<AppendResult<Operation>>, AppendError>
  readonly compact: (
    key: DocumentId,
    through: Sequence,
  ) => Effect.Effect<void, InvalidCompactionError | JournalError>
  /**
   * Rebuilds the database file, returning to the file system the space that
   * `compact` freed: compaction empties payloads but leaves their pages allocated.
   * It rewrites every table and holds the database while it runs, so it is
   * maintenance, not something to run per commit.
   */
  readonly vacuum: () => Effect.Effect<void, JournalError>
  /** The document keys that have a snapshot or a committed operation. */
  readonly keys: () => Effect.Effect<ReadonlyArray<DocumentId>, JournalError>
  /** Every recorded effect that is not `succeeded`, for recovery. */
  readonly unfinished: () => Effect.Effect<ReadonlyArray<EffectRecord>, JournalError>
  /** The recorded effect for a key, if it has ever run. */
  readonly effect: (key: string) => Effect.Effect<Option.Option<EffectRecord>, JournalError>
  /**
   * Reuses recorded successes and shares concurrent runs within this journal
   * instance. Pending and failed records are retried when called again, unless
   * `retryFailed` says otherwise — `false` for every failed record, or a
   * predicate that decides from the record itself.
   * An external action can succeed before its result is recorded; recovery
   * requires provider idempotency or reconciliation. Use a stable key including
   * the document, operation, and semantic effect identity, and pass that same
   * key to the provider. Results must be JSON-compatible. See the README's
   * effect recovery policy before retrying work with uncertain outcomes.
   */
  readonly runEffect: <Result, E>(
    key: string,
    run: Effect.Effect<Result, E>,
    options?: { readonly retryFailed?: boolean | ((record: EffectRecord) => boolean) },
  ) => Effect.Effect<Result, E | JournalError | EffectFailedError>
  /** Removes an effect record so the next `runEffect` treats it as new work. */
  readonly clearEffect: (key: string) => Effect.Effect<void, JournalError>
  /**
   * Runs the effect intents of a document's committed operations after `from`,
   * reusing recorded successes and stopping before any operation whose intent
   * failed or was skipped. Returns the cursor up to which every intent settled,
   * so a caller can persist it and resume. The journal does not schedule this;
   * the application owns discovery and startup.
   */
  readonly recover: (
    options: RecoveryOptions<Operation>,
  ) => Effect.Effect<Cursor, InvalidCursorError | CompactedCursorError | JournalError>
  /**
   * Drops a document's snapshot and operations, and its epoch, so the next `epoch` differs.
   * Replica bindings stay: they are who a replica is, not history. Effect records are keyed
   * by the application's own effect identity, not by document, so they are not scoped to a
   * key; `clearEffect` removes one.
   */
  readonly reset: (key: DocumentId) => Effect.Effect<void, JournalError>
  /**
   * The document keys a commit changed. Subscription is a `Stream`, so a
   * subscriber never fails or slows a commit; a caller that needs a callback
   * adapts it at the edge.
   */
  readonly subscribe: Stream.Stream<string>
}

const describe = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause)

/** A compacted operation keeps this instead of its payload, so identity is provable. */
// SHA-256 in plain JavaScript, so the journal runs where `node:crypto` does not.
const hashPayload = (encoded: string): string => bytesToHex(sha256(utf8ToBytes(encoded)))

/**
 * Canonical JSON with sorted object keys. `append` compares encoded bytes for
 * idempotency, so two logically equal operations must encode identically;
 * otherwise a retry with a different key order looks like a conflicting reuse.
 * Non-plain objects are left to `JSON.stringify` (a `Date`'s `toJSON` still runs).
 */
const canonicalJson = (value: unknown): string | undefined => {
  const build = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(build)
    if (input !== null && typeof input === 'object') {
      const proto = Object.getPrototypeOf(input)
      if (proto === Object.prototype || proto === null) {
        const out: Record<string, unknown> = {}
        for (const key of Object.keys(input).sort()) {
          out[key] = build((input as Record<string, unknown>)[key])
        }
        return out
      }
    }
    return input
  }
  const stable = build(value)
  return stable === undefined ? undefined : JSON.stringify(stable)
}

/**
 * The canonical hash of a stored payload, for the schema-3 migration. A payload
 * that cannot be parsed keeps its legacy hash; a compacted payload has none to
 * read, so its pre-canonical hash cannot be corrected.
 */
const canonicalHash = (input: string): string => {
  try {
    return hashPayload(canonicalJson(JSON.parse(input)) ?? input)
  } catch {
    return hashPayload(input)
  }
}

/** `runEffect`'s `retryFailed`, in either form; a failed record is retried by default. */
const retriesFailed = (
  policy: boolean | ((record: EffectRecord) => boolean) | undefined,
  record: EffectRecord,
): boolean => (policy === undefined ? true : typeof policy === 'boolean' ? policy : policy(record))

const journalError = (message: string, cause: unknown): JournalError =>
  new JournalError({ message, cause })

const asJournalError =
  (message: string) =>
  (cause: unknown): Effect.Effect<never, JournalError> =>
    Effect.fail(journalError(message, cause))

/**
 * Opens the journal over the `SqlClient` in context: SQLite through any
 * `effect/sql` driver, `@effect/sql-sqlite-node` on a server or
 * `@effect/sql-sqlite-wasm` in a browser. `Journal.make` (`foldkit-durable`)
 * is this over a `node:sqlite` file. The connection is the caller's: it
 * lives as long as the layer that provided it. Not exported from either
 * entry, for that reason: they give it as a layer (`service.ts`) or over a
 * file it opens itself (`node.ts`), so the database cannot close under it.
 */
export const makeJournalOn = <
  Operation,
  Snapshot,
  Principal,
  OperationEncoded = unknown,
  SnapshotEncoded = unknown,
>(
  options: JournalStoreOptions<Operation, Snapshot, Principal, OperationEncoded, SnapshotEncoded>,
): Effect.Effect<
  Journal<Operation, Snapshot, Principal, OperationEncoded>,
  JournalError | UnsupportedJournalVersionError,
  SqlClient.SqlClient | Scope.Scope
> => makeShapeEffect(options)

const makeShapeEffect = <
  Operation,
  Snapshot,
  Principal,
  OperationEncoded = unknown,
  SnapshotEncoded = unknown,
>(
  options: JournalStoreOptions<Operation, Snapshot, Principal, OperationEncoded, SnapshotEncoded>,
): Effect.Effect<
  Journal<Operation, Snapshot, Principal, OperationEncoded>,
  JournalError | UnsupportedJournalVersionError,
  SqlClient.SqlClient | Scope.Scope
> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* migrate(sql, options.d1 === true)
    if (options.replicaId !== undefined) {
      const decode = resolveCodec(options.operation).decode
      yield* atomically(
        sql,
        options.d1 === true,
        Effect.gen(function* () {
          const legacy = yield* sql<{
            readonly key: string
            readonly op_id: string
            readonly actor_id: string
            readonly input: string | null
          }>`SELECT key, op_id, actor_id, input FROM operations WHERE replica_id IS NULL`
          for (const row of legacy) {
            const replica = yield* Effect.try({
              try: () => {
                if (row.input !== null) return options.replicaId!(decode(JSON.parse(row.input)))
                if (options.legacyReplicaId === undefined)
                  throw new Error('A compacted operation needs legacyReplicaId')
                return options.legacyReplicaId(toOpId(row.op_id))
              },
              catch: cause => journalError('Could not recover a legacy replica', cause),
            })
            const bound = yield* sql<{
              readonly actor_id: string
            }>`SELECT actor_id FROM replicas WHERE key = ${row.key} AND replica_id = ${replica}`
            if (bound.length > 0 && bound[0]!.actor_id !== row.actor_id)
              return yield* Effect.fail(
                journalError(`Replica "${replica}" has operations from different actors`, row),
              )
            yield* sql`INSERT OR IGNORE INTO replicas (key, replica_id, actor_id) VALUES (${row.key}, ${replica}, ${row.actor_id})`
            yield* sql`UPDATE operations SET replica_id = ${replica} WHERE key = ${row.key} AND op_id = ${row.op_id}`
          }
        }),
      ).pipe(Effect.catchTag('SqlError', asJournalError('Could not recover legacy replicas')))
    }
    // A sliding change stream: publishing never blocks a commit, and a slow
    // subscriber drops the oldest keys instead of growing memory without bound.
    // A dropped key is a missed wake-up, not missed data; subscribers reconcile
    // from their own cursor.
    const changes = yield* PubSub.sliding<string>(1024)
    // Ending the journal ends its subscription stream, so a forked subscriber
    // cannot outlive the connection.
    yield* Effect.addFinalizer(() => PubSub.shutdown(changes))
    const inFlight = yield* SynchronizedRef.make(
      new Map<string, Deferred.Deferred<unknown, unknown>>(),
    )
    return makeShape(sql, options, changes, inFlight)
  })

/** Where the schema version lives when `PRAGMA user_version` is unavailable (D1). */
const META_VERSION_KEY = 'schema_version'

/**
 * Whether `table` already has `column`. Guards an `ADD COLUMN` a crashed
 * migration may have run before the version was written. The table is one of
 * two literals, never client input; a pragma takes no bound parameters, so
 * this is the one `unsafe` the journal needs besides the version assignment.
 */
const hasColumn = (
  sql: SqlClient.SqlClient,
  table: 'operations' | 'documents',
  column: string,
): Effect.Effect<boolean, SqlError> =>
  Effect.map(sql.unsafe<{ readonly name: string }>(`PRAGMA table_info(${table})`), rows =>
    rows.some(row => row.name === column),
  )

/** The schema version `PRAGMA user_version` holds. */
const readPragmaVersion = (sql: SqlClient.SqlClient): Effect.Effect<number, SqlError> =>
  Effect.map(
    sql<{ readonly user_version: number }>`PRAGMA user_version`,
    version => version[0]?.user_version ?? 0,
  )

/**
 * The schema version `durable_meta` holds. The table is created first, so a
 * missing row — a fresh database, or one whose migration never finished —
 * reads as version 0 and the guarded steps below run (or rerun) safely.
 */
const readMetaVersion = (sql: SqlClient.SqlClient): Effect.Effect<number, JournalError> =>
  Effect.gen(function* () {
    yield* sql`CREATE TABLE IF NOT EXISTS durable_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`
    const rows = yield* sql<{
      readonly value: string
    }>`SELECT value FROM durable_meta WHERE key = ${META_VERSION_KEY}`
    const raw = rows[0]?.value
    if (raw === undefined) return 0
    const version = Number(raw)
    if (!Number.isSafeInteger(version) || version < 0) {
      return yield* Effect.fail(
        new JournalError({ message: `Journal schema version is not a version: ${raw}` }),
      )
    }
    return version
  }).pipe(Effect.catchTag('SqlError', asJournalError('Could not migrate the journal')))

/** Creates or upgrades the tables, keyed by `user_version`, or `durable_meta` on D1. */
const migrate = (
  sql: SqlClient.SqlClient,
  d1: boolean,
): Effect.Effect<void, JournalError | UnsupportedJournalVersionError> =>
  Effect.gen(function* () {
    const current = d1 ? yield* readMetaVersion(sql) : yield* readPragmaVersion(sql)
    // A newer schema was written by a build that may rely on invariants this one
    // does not know; refuse it rather than operating against the wrong layout.
    if (current > SCHEMA_VERSION)
      return yield* Effect.fail(
        new UnsupportedJournalVersionError({
          found: current,
          supported: SCHEMA_VERSION,
          message: `Journal schema ${current} is newer than this build supports (${SCHEMA_VERSION})`,
        }),
      )
    if (current === SCHEMA_VERSION) return
    // One transaction, except on D1, which has none: each step then commits
    // on its own, and rerunning them after a crash is safe (tables `IF NOT
    // EXISTS`, columns guarded, backfills idempotent).
    const upgrade = Effect.gen(function* () {
      if (current < 1) {
        yield* sql`CREATE TABLE IF NOT EXISTS documents (
            key TEXT PRIMARY KEY, cursor INTEGER NOT NULL, snapshot TEXT NOT NULL,
            compact_before INTEGER NOT NULL DEFAULT 0
          )`
        yield* sql`CREATE TABLE IF NOT EXISTS operations (
            key TEXT NOT NULL, op_id TEXT NOT NULL, sequence INTEGER NOT NULL,
            actor_id TEXT NOT NULL, input TEXT,
            PRIMARY KEY (key, op_id), UNIQUE (key, sequence)
          )`
        yield* sql`CREATE TABLE IF NOT EXISTS effects (
            key TEXT PRIMARY KEY, status TEXT NOT NULL, result TEXT, error TEXT
          )`
      }
      if (current < 2) {
        if (!(yield* hasColumn(sql, 'operations', 'payload_hash')))
          yield* sql`ALTER TABLE operations ADD COLUMN payload_hash TEXT`
        // Backfill identities for operations retained from before this column
        // existed, so a later retransmission can still prove its payload. SHA-256
        // is not available in SQL, so the rows are hashed in JavaScript. The
        // schema-3 step below recomputes these canonically.
        const retained = yield* sql<{
          readonly key: string
          readonly op_id: string
          readonly input: string
        }>`SELECT key, op_id, input FROM operations WHERE input IS NOT NULL`
        yield* Effect.forEach(
          retained,
          row =>
            sql`UPDATE operations SET payload_hash = ${hashPayload(String(row.input))} WHERE key = ${row.key} AND op_id = ${row.op_id}`,
          { discard: true },
        )
      }
      if (current < 3) {
        // Hashes written before canonical encoding would make a compacted row
        // reject a retry with a different key order. Recompute every retained
        // payload's hash canonically; an already-compacted row keeps its legacy
        // hash because its payload is gone.
        const retained = yield* sql<{
          readonly key: string
          readonly op_id: string
          readonly input: string
        }>`SELECT key, op_id, input FROM operations WHERE input IS NOT NULL`
        yield* Effect.forEach(
          retained,
          row =>
            sql`UPDATE operations SET payload_hash = ${canonicalHash(String(row.input))} WHERE key = ${row.key} AND op_id = ${row.op_id}`,
          { discard: true },
        )
      }
      if (current < 4) {
        // The snapshot may lag the cursor by up to `snapshotEvery` commits; this
        // is the sequence it was written at. Every earlier snapshot was current.
        if (!(yield* hasColumn(sql, 'documents', 'snapshot_cursor')))
          yield* sql`ALTER TABLE documents ADD COLUMN snapshot_cursor INTEGER NOT NULL DEFAULT 0`
        yield* sql`UPDATE documents SET snapshot_cursor = cursor`
      }
      if (current < 5) {
        yield* sql`CREATE TABLE IF NOT EXISTS epochs (key TEXT PRIMARY KEY, epoch TEXT NOT NULL)`
        yield* sql`CREATE TABLE IF NOT EXISTS replicas (
            key TEXT NOT NULL, replica_id TEXT NOT NULL, actor_id TEXT NOT NULL,
            PRIMARY KEY (key, replica_id)
          )`
      }
      if (current < 6) {
        if (!(yield* hasColumn(sql, 'operations', 'replica_id')))
          yield* sql`ALTER TABLE operations ADD COLUMN replica_id TEXT`
        const documents = yield* sql<{ readonly key: string }>`SELECT key FROM documents`
        yield* Effect.forEach(
          documents,
          row =>
            sql`INSERT OR IGNORE INTO epochs (key, epoch) VALUES (${row.key}, ${globalThis.crypto.randomUUID()})`,
          { discard: true },
        )
      }
      if (d1) {
        yield* sql`INSERT INTO durable_meta (key, value) VALUES (${META_VERSION_KEY}, ${String(SCHEMA_VERSION)}) ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      } else {
        // A literal, not a bound parameter: SQLite rejects a placeholder in a
        // PRAGMA assignment. Built from SCHEMA_VERSION so the two cannot drift.
        yield* sql.unsafe(`PRAGMA user_version = ${SCHEMA_VERSION}`)
      }
    })
    yield* d1 ? upgrade : sql.withTransaction(upgrade)
  }).pipe(Effect.catchTag('SqlError', asJournalError('Could not migrate the journal')))

/**
 * One transaction, except on D1, which has none: run the unit directly.
 * Every unit the journal runs this way stays correct without one —
 * idempotent writes, constraint-checked commits, re-checked reads — except
 * as the `d1` option documents.
 */
const atomically = <A, E, R>(
  sql: SqlClient.SqlClient,
  d1: boolean,
  unit: Effect.Effect<A, E, R>,
): Effect.Effect<A, E | SqlError, R> => (d1 ? unit : sql.withTransaction(unit))

/** How many times a D1 commit retries on a uniqueness conflict before failing. */
const MAX_COMMIT_RETRIES = 10

/**
 * Whether a storage failure is a uniqueness conflict a retried commit can
 * win: a typed violation, or constraint text carried as an unclassified
 * error. Drivers wrap the database's message in layers of causes — D1's
 * `UNIQUE constraint failed` arrives three deep — so the text is read down
 * the whole chain.
 */
const causesText = (error: unknown): string => {
  let text = ''
  let current = error
  const seen = new Set<unknown>()
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current)
    text += `\n${current.message}`
    current = (current as { readonly cause?: unknown }).cause
  }
  return text
}

/** Whether retrying the failed commit can win a uniqueness race. */
const isConstraintViolation = (error: SqlError): boolean => {
  const reason = error.reason
  return (
    reason._tag === 'UniqueViolation' ||
    reason._tag === 'ConstraintError' ||
    (reason._tag === 'UnknownError' && /constraint failed/i.test(causesText(reason)))
  )
}

interface OperationRow {
  readonly actor_id: string
  readonly op_id: string
  readonly sequence: number
  readonly input: string | null
  readonly payload_hash: string | null
}

interface EffectRow {
  readonly key: string
  readonly status: string
  readonly result: string | null
  readonly error: string | null
}

const makeShape = <
  Operation,
  Snapshot,
  Principal,
  OperationEncoded = unknown,
  SnapshotEncoded = unknown,
>(
  sql: SqlClient.SqlClient,
  options: JournalStoreOptions<Operation, Snapshot, Principal, OperationEncoded, SnapshotEncoded>,
  changes: PubSub.PubSub<string>,
  inFlight: SynchronizedRef.SynchronizedRef<Map<string, Deferred.Deferred<unknown, unknown>>>,
): Journal<Operation, Snapshot, Principal, OperationEncoded> => {
  type Shape = Journal<Operation, Snapshot, Principal, OperationEncoded>

  // Resolve a `Schema.Codec` to its function pair once, not on every append:
  // `Schema.decodeUnknownSync` compiles the schema each time it is called.
  const operationCodec: Codec<Operation, OperationEncoded> = resolveCodec(options.operation)
  const snapshotCodec: Codec<Snapshot, SnapshotEncoded> = resolveCodec(options.snapshot)

  const snapshotEvery = options.snapshotEvery ?? 1
  if (!Number.isSafeInteger(snapshotEvery) || snapshotEvery < 1)
    throw new Error('Journal: snapshotEvery must be a positive integer')
  const d1 = options.d1 === true

  /**
   * A document's state at its cursor, the sequence its stored snapshot was written at, and
   * the operation committed at the cursor.
   */
  interface Current {
    readonly snapshot: Snapshot
    readonly cursor: Cursor
    readonly snapshotCursor: number
    readonly last: string | null
    readonly epoch: string | null
  }
  /**
   * The state of each document this journal last read or committed, the most recent few
   * hundred. A hit needs the stored cursor, snapshot cursor, last operation and epoch to
   * match, so another connection's commit or reset invalidates it even if a new history
   * reuses the same cursor and operation id.
   */
  const current = new Map<string, Current>()
  const remember = (key: string, state: Current): void => {
    current.delete(key)
    current.set(key, state)
    if (current.size > CACHED_DOCUMENTS) current.delete(current.keys().next().value!)
  }

  /**
   * The document's state at its cursor: from `working` (commits of the transaction in
   * progress), the cache, or the stored snapshot with the operations since replayed.
   * Compaction never removes an operation the stored snapshot has not folded in.
   */
  const materialize = (key: DocumentId, working?: ReadonlyMap<string, Current>) =>
    Effect.gen(function* () {
      const pending = working?.get(key)
      if (pending !== undefined) return pending
      const rows = yield* sql<{
        readonly cursor: number
        readonly snapshot_cursor: number
        readonly last: string | null
        readonly epoch: string | null
      }>`SELECT d.cursor, d.snapshot_cursor, o.op_id AS last, e.epoch FROM documents d LEFT JOIN operations o ON o.key = d.key AND o.sequence = d.cursor LEFT JOIN epochs e ON e.key = d.key WHERE d.key = ${key}`
      const row = rows[0]
      if (row === undefined)
        return {
          snapshot: options.empty(),
          cursor: toCursor(0),
          snapshotCursor: 0,
          last: null,
          epoch: null,
        }
      const cursor = toCursor(Number(row.cursor))
      const snapshotCursor = Number(row.snapshot_cursor)
      const last = row.last === null ? null : String(row.last)
      const epoch = row.epoch === null ? null : String(row.epoch)
      const cached = current.get(key)
      if (
        cached !== undefined &&
        cached.cursor === cursor &&
        cached.snapshotCursor === snapshotCursor &&
        cached.last === last &&
        cached.epoch === epoch
      )
        return cached
      const stored = yield* sql<{
        readonly snapshot: string
      }>`SELECT snapshot FROM documents WHERE key = ${key}`
      const since =
        // Bounded above by the cursor read with the snapshot: without a
        // transaction a concurrent commit could otherwise land between the
        // two reads and be replayed twice, once here and once on the next
        // materialize.
        snapshotCursor < cursor
          ? yield* sql<{
              readonly input: string
            }>`SELECT input FROM operations WHERE key = ${key} AND sequence > ${snapshotCursor} AND sequence <= ${cursor} ORDER BY sequence`
          : []
      const snapshot = yield* Effect.try({
        try: () =>
          since.reduce(
            (state, operation) =>
              options.reduce(state, operationCodec.decode(JSON.parse(String(operation.input)))),
            snapshotCodec.decode(JSON.parse(String(stored[0]!.snapshot))),
          ),
        catch: cause => journalError('Could not load the snapshot', cause),
      })
      const found = { snapshot, cursor, snapshotCursor, last, epoch }
      remember(key, found)
      return found
    })

  const load: Shape['load'] = Effect.fn('Journal.load')(function* (key: DocumentId) {
    yield* Effect.annotateCurrentSpan({ key })
    const { snapshot, cursor } = yield* atomically(sql, d1, materialize(key)).pipe(
      Effect.catchTag('SqlError', asJournalError('Could not load the snapshot')),
    )
    return { snapshot, cursor }
  })

  const cursor: Shape['cursor'] = Effect.fn('Journal.cursor')(function* (key: DocumentId) {
    yield* Effect.annotateCurrentSpan({ key })
    const rows = yield* sql<{
      readonly cursor: number
    }>`SELECT cursor FROM documents WHERE key = ${key}`.pipe(
      Effect.catchTag('SqlError', asJournalError('Could not read the cursor')),
    )
    return toCursor(rows[0]?.cursor ?? 0)
  })

  const epoch: Shape['epoch'] = Effect.fn('Journal.epoch')(function* (key: DocumentId) {
    yield* Effect.annotateCurrentSpan({ key })
    const read = sql<{ readonly epoch: string }>`SELECT epoch FROM epochs WHERE key = ${key}`
    // Read first: an exchange asks every time, and only the first ever needs to write.
    const rows = yield* read.pipe(
      Effect.flatMap(found =>
        found.length > 0
          ? Effect.succeed(found)
          : atomically(
              sql,
              d1,
              sql`INSERT OR IGNORE INTO epochs (key, epoch) VALUES (${key}, ${globalThis.crypto.randomUUID()})`.pipe(
                Effect.andThen(read),
              ),
            ),
      ),
      Effect.catchTag('SqlError', asJournalError('Could not read the epoch')),
    )
    return String(rows[0]!.epoch)
  })

  const floor: Shape['floor'] = Effect.fn('Journal.floor')(function* (key: DocumentId) {
    yield* Effect.annotateCurrentSpan({ key })
    const rows = yield* sql<{
      readonly compact_before: number
    }>`SELECT compact_before FROM documents WHERE key = ${key}`.pipe(
      Effect.catchTag('SqlError', asJournalError('Could not read the compaction floor')),
    )
    return toSequence(rows[0]?.compact_before ?? 0)
  })

  const read: Shape['read'] = Effect.fn('Journal.read')(function* (
    key: DocumentId,
    after: Cursor,
    options?: { readonly limit?: number },
  ) {
    const limit = options?.limit ?? -1
    if (limit !== -1 && (!Number.isSafeInteger(limit) || limit < 1))
      return yield* Effect.die(new Error('Journal.read: limit must be a positive integer'))
    yield* Effect.annotateCurrentSpan({ key, after })
    // One transaction, so a compaction cannot land between the floor check and the read
    // and leave a tail that starts late. Without one (D1), the floor is
    // checked again after the page: a compaction that landed between is
    // refused rather than returned as a silently short tail.
    const rows = yield* atomically(
      sql,
      d1,
      Effect.gen(function* () {
        const documents = yield* sql<{
          readonly cursor: number
          readonly compact_before: number
        }>`SELECT cursor, compact_before FROM documents WHERE key = ${key}`
        const cursor = toCursor(documents[0]?.cursor ?? 0)
        if (!Number.isSafeInteger(after) || after < 0 || after > cursor)
          return yield* Effect.fail(
            new InvalidCursorError({
              after,
              cursor,
              message: `Cursor ${after} is outside [0, ${cursor}]`,
            }),
          )
        // Compaction removes the payloads a cursor below the floor would need. Fail
        // closed rather than returning a tail that silently starts late.
        const floor = toSequence(documents[0]?.compact_before ?? 0)
        if (after < floor)
          return yield* Effect.fail(
            new CompactedCursorError({
              after,
              floor,
              cursor,
              message: `Cursor ${after} is below the compaction floor ${floor}`,
            }),
          )
        const page =
          yield* sql<OperationRow>`SELECT actor_id, op_id, sequence, input FROM operations WHERE key = ${key} AND sequence > ${after} AND input IS NOT NULL ORDER BY sequence LIMIT ${limit}`
        if (d1) {
          const reread = yield* sql<{
            readonly compact_before: number
          }>`SELECT compact_before FROM documents WHERE key = ${key}`
          const floorAgain = toSequence(reread[0]?.compact_before ?? 0)
          if (after < floorAgain)
            return yield* Effect.fail(
              new CompactedCursorError({
                after,
                floor: floorAgain,
                cursor,
                message: `Cursor ${after} is below the compaction floor ${floorAgain}`,
              }),
            )
        }
        return page
      }),
    ).pipe(Effect.catchTag('SqlError', asJournalError('Could not read the log')))
    return yield* Effect.try({
      try: () =>
        rows.map(row => ({
          operation: operationCodec.decode(JSON.parse(String(row.input))),
          opId: toOpId(String(row.op_id)),
          sequence: toSequence(Number(row.sequence)),
          actorId: toActorId(String(row.actor_id)),
        })),
      catch: cause => journalError('Could not read the log', cause),
    })
  })

  /** An operation as stored: canonical JSON, so equal operations are equal text. */
  const encodeCanonical = (value: Operation) =>
    Effect.try({
      try: () => {
        const json = canonicalJson(operationCodec.encode(value))
        if (json === undefined) throw new Error('operation encoded to no JSON value')
        return json
      },
      catch: cause => new InvalidOperationError({ message: 'Invalid operation', cause }),
    })

  interface PreparedOperation {
    readonly operation: Operation
    readonly opId: OpId
    readonly actorId: ActorId
    readonly encoded: string
    readonly payloadHash: string
  }

  interface AppendOutcome {
    readonly result: AppendResult<Operation>
    readonly changed: boolean
  }

  const prepare = (
    key: DocumentId,
    input: OperationEncoded,
    principal: Principal,
  ): Effect.Effect<PreparedOperation, InvalidOperationError> =>
    Effect.gen(function* () {
      const operation = yield* Effect.try({
        try: () => operationCodec.decode(input),
        catch: cause => new InvalidOperationError({ message: 'Invalid operation', cause }),
      })
      const opId = yield* Effect.try({
        try: () => options.opId(operation),
        catch: cause => new InvalidOperationError({ message: 'Invalid operation', cause }),
      })
      const actorId = yield* Effect.try({
        try: () => options.actorId(principal),
        catch: cause => new InvalidOperationError({ message: 'Invalid operation', cause }),
      })
      const encoded = yield* encodeCanonical(operation)
      return { operation, opId, actorId, encoded, payloadHash: hashPayload(encoded) }
    })

  /**
   * Commits one prepared operation. Runs inside a transaction and never publishes; the
   * state it commits goes into `working`, for the cache once the transaction commits.
   */
  const commitPrepared = (
    key: DocumentId,
    prepared: PreparedOperation,
    principal: Principal,
    working: Map<string, Current>,
  ) =>
    Effect.gen(function* () {
      const { operation, opId, actorId, encoded, payloadHash } = prepared
      const conflict = (): IdentityConflictError =>
        new IdentityConflictError({
          opId,
          message: `Operation "${opId}" was reused with different data or actor`,
        })
      const prior =
        yield* sql<OperationRow>`SELECT actor_id, op_id, sequence, input, payload_hash FROM operations WHERE key = ${key} AND op_id = ${opId}`
      if (prior.length > 0) {
        const row = prior[0]!
        const sequence = toSequence(Number(row.sequence))
        const priorActor = toActorId(String(row.actor_id))
        if (row.input !== null) {
          // Compare what was sent, by its canonical hash: the stored input is the
          // stamped operation, and a retransmission with a different key order is
          // the same operation. A row without a hash is compared by its canonical form.
          const same =
            row.payload_hash !== null
              ? row.payload_hash === payloadHash
              : (yield* Effect.try({
                  try: () => canonicalJson(JSON.parse(String(row.input))),
                  catch: cause =>
                    new InvalidOperationError({ message: 'Invalid operation', cause }),
                })) === encoded
          if (!same || priorActor !== actorId) return yield* Effect.fail(conflict())
          const stored = yield* Effect.try({
            try: () => operationCodec.decode(JSON.parse(String(row.input))),
            catch: cause => new InvalidOperationError({ message: 'Invalid operation', cause }),
          })
          return {
            result: {
              _tag: 'Committed' as const,
              committed: { operation: stored, opId, sequence, actorId: priorActor },
            },
            changed: false,
          }
        }
        // The payload was compacted away. Answer idempotently from the stored
        // identity, but never rebuild a committed operation from the
        // retransmitted content: it may not be what was committed.
        if (
          priorActor !== actorId ||
          (row.payload_hash !== null && row.payload_hash !== payloadHash)
        )
          return yield* Effect.fail(conflict())
        return {
          result: { _tag: 'AlreadyCommitted' as const, opId, sequence, actorId: priorActor },
          changed: false,
        }
      }
      let replica: string | null = null
      if (options.replicaId !== undefined) {
        replica = yield* Effect.try({
          try: () => options.replicaId!(operation),
          catch: cause => new InvalidOperationError({ message: 'Invalid operation', cause }),
        })
        const bound = yield* sql<{
          readonly actor_id: string
        }>`SELECT actor_id FROM replicas WHERE key = ${key} AND replica_id = ${replica}`
        if (bound.length === 0)
          yield* sql`INSERT INTO replicas (key, replica_id, actor_id) VALUES (${key}, ${replica}, ${actorId})`
        else if (String(bound[0]!.actor_id) !== actorId)
          return yield* Effect.fail(
            new OperationRejectedError({
              opId,
              message: `Operation "${opId}" names a replica another actor holds`,
            }),
          )
      }
      // A stored state that no longer loads is the server's failure, not this operation's:
      // it stays a `JournalError`, which a caller retries rather than rejecting the edit.
      const state = yield* materialize(key, working)
      let epoch = state.epoch
      if (epoch === null) {
        yield* sql`INSERT OR IGNORE INTO epochs (key, epoch) VALUES (${key}, ${globalThis.crypto.randomUUID()})`
        const rows = yield* sql<{
          readonly epoch: string
        }>`SELECT epoch FROM epochs WHERE key = ${key}`
        epoch = rows[0]!.epoch
      }
      const { snapshot, cursor, snapshotCursor } = state
      const validation = yield* Effect.try({
        try: () => options.validate?.({ key, principal, operation, snapshot, cursor }),
        catch: cause => new InvalidOperationError({ message: 'Invalid operation', cause }),
      })
      if (validation !== undefined) yield* validation
      const decision = yield* Effect.try({
        try: () => options.authorize?.({ key, principal, operation, snapshot }) ?? true,
        catch: cause => new InvalidOperationError({ message: 'Invalid operation', cause }),
      })
      // `allowed` distinguishes the refusal object from an Effect; a boolean
      // and an object are the only two non-suspended answers.
      const settled =
        typeof decision === 'boolean' || 'allowed' in decision ? decision : yield* decision
      if (settled !== true) {
        const reason = settled === false ? undefined : settled.reason
        return yield* Effect.fail(
          new OperationRejectedError({
            opId,
            message:
              reason === undefined
                ? `Operation "${opId}" was refused by authorization`
                : `Operation "${opId}" was refused by authorization: ${reason}`,
            ...(reason === undefined ? {} : { reason }),
          }),
        )
      }
      const sequence = toSequence(cursor + 1)
      const stamped =
        options.stamp === undefined
          ? operation
          : yield* Effect.try({
              try: () => {
                const value = options.stamp!(operation, { sequence, actorId })
                if (options.opId(value) !== opId)
                  throw new Error(`stamp changed the operation's identity from "${opId}"`)
                return value
              },
              catch: cause => new InvalidOperationError({ message: 'Invalid operation', cause }),
            })
      const input = stamped === operation ? encoded : yield* encodeCanonical(stamped)
      const reduced = yield* Effect.try({
        try: () => options.reduce(snapshot, stamped),
        catch: cause => new InvalidOperationError({ message: 'Invalid operation', cause }),
      })
      const encodeSnapshot = (value: Snapshot) =>
        Effect.try({
          try: () => JSON.stringify(snapshotCodec.encode(value)),
          catch: cause => new InvalidOperationError({ message: 'Invalid operation', cause }),
        })
      yield* sql`INSERT INTO operations (key, op_id, sequence, actor_id, input, payload_hash, replica_id) VALUES (${key}, ${opId}, ${sequence}, ${actorId}, ${input}, ${payloadHash}, ${replica})`
      const writes = sequence - snapshotCursor >= snapshotEvery
      if (writes) {
        const encodedSnapshot = yield* encodeSnapshot(reduced)
        yield* sql`INSERT INTO documents (key, cursor, snapshot, snapshot_cursor) VALUES (${key}, ${sequence}, ${encodedSnapshot}, ${sequence}) ON CONFLICT(key) DO UPDATE SET cursor = excluded.cursor, snapshot = excluded.snapshot, snapshot_cursor = excluded.snapshot_cursor`
      } else if (cursor === 0) {
        // A first commit that does not write its snapshot starts the row from the empty one.
        const encodedEmpty = yield* encodeSnapshot(snapshot)
        yield* sql`INSERT INTO documents (key, cursor, snapshot, snapshot_cursor) VALUES (${key}, ${sequence}, ${encodedEmpty}, 0)`
      } else yield* sql`UPDATE documents SET cursor = ${sequence} WHERE key = ${key}`
      working.set(key, {
        snapshot: reduced,
        cursor: toCursor(sequence),
        snapshotCursor: writes ? sequence : snapshotCursor,
        last: opId,
        epoch,
      })
      return {
        result: {
          _tag: 'Committed' as const,
          committed: { operation: stamped, opId, sequence, actorId },
        },
        changed: true,
      }
    })

  /**
   * One prepared operation committed, with the state it committed for the
   * cache once the commit stands. Fresh per attempt: a retried commit
   * re-reads everything rather than reusing what a conflict invalidated.
   */
  const commitOnce = (
    key: DocumentId,
    prepared: PreparedOperation,
    principal: Principal,
  ): Effect.Effect<
    { readonly outcome: AppendOutcome; readonly working: Map<string, Current> },
    InvalidOperationError | OperationRejectedError | IdentityConflictError | SqlError | JournalError
  > =>
    Effect.gen(function* () {
      const working = new Map<string, Current>()
      const outcome = yield* commitPrepared(key, prepared, principal, working)
      return { outcome, working }
    })

  /** Remembers what a stood commit decided, for the cache. Runs after the commit. */
  const settleCommit = (committed: {
    readonly outcome: AppendOutcome
    readonly working: Map<string, Current>
  }): AppendOutcome => {
    for (const [document, state] of committed.working) remember(document, state)
    return committed.outcome
  }

  /** Remembers what a stood batch decided, for the cache. Runs after the commit. */
  const settleBatch = (
    committed: ReadonlyArray<{
      readonly outcome: AppendOutcome
      readonly working: Map<string, Current>
    }>,
  ): ReadonlyArray<AppendOutcome> => {
    for (const { working } of committed)
      for (const [document, state] of working) remember(document, state)
    return committed.map(entry => entry.outcome)
  }

  /**
   * Commits durably: one transaction everywhere, whole-commit retries on D1.
   * A uniqueness conflict lost a race — the sequence, the replica binding,
   * or the operation id landed first — so the next attempt re-reads the
   * cursor and replays the decision. Anything else, a refused or invalid
   * operation, fails at once.
   */
  const commitDurably = (
    key: DocumentId,
    prepared: PreparedOperation,
    principal: Principal,
  ): Effect.Effect<
    AppendOutcome,
    InvalidOperationError | OperationRejectedError | IdentityConflictError | SqlError | JournalError
  > => {
    const unit = commitOnce(key, prepared, principal).pipe(Effect.map(settleCommit))
    return d1
      ? unit.pipe(
          Effect.retry({
            while: error => error._tag === 'SqlError' && isConstraintViolation(error),
            schedule: Schedule.recurs(MAX_COMMIT_RETRIES),
          }),
        )
      : sql.withTransaction(unit)
  }

  // Publish and observe only after the transaction committed, so a subscriber
  // never sees a change that could still roll back.
  const announce = (key: DocumentId, outcome: AppendOutcome): Effect.Effect<void> =>
    outcome.changed && outcome.result._tag === 'Committed'
      ? Effect.all([
          Metric.update(journalMetrics.appends, 1),
          Effect.logDebug('journal append', {
            key,
            opId: outcome.result.committed.opId,
            sequence: outcome.result.committed.sequence,
          }),
          PubSub.publish(changes, key),
        ]).pipe(Effect.asVoid)
      : Effect.void

  const append: Shape['append'] = Effect.fn('Journal.append')(function* (
    key: DocumentId,
    input: OperationEncoded,
    principal: Principal,
  ) {
    const prepared = yield* prepare(key, input, principal)
    yield* Effect.annotateCurrentSpan({ key, opId: prepared.opId })
    const outcome = yield* commitDurably(key, prepared, principal).pipe(
      Effect.catchTag('SqlError', asJournalError('Could not append the operation')),
    )
    yield* announce(key, outcome)
    return outcome.result
  })

  const appendAll: Shape['appendAll'] = Effect.fn('Journal.appendAll')(function* (
    key: DocumentId,
    inputs: ReadonlyArray<OperationEncoded>,
    principal: Principal,
  ) {
    if (inputs.length === 0) return []
    const prepared = yield* Effect.forEach(inputs, input => prepare(key, input, principal))
    // One transaction, so the batch commits atomically and in order. On D1
    // there is none: each operation commits (and retries) on its own.
    const outcomes = yield* (
      d1
        ? Effect.forEach(prepared, entry => commitDurably(key, entry, principal), {
            concurrency: 1,
          })
        : sql
            .withTransaction(
              Effect.forEach(prepared, entry => commitOnce(key, entry, principal), {
                concurrency: 1,
              }),
            )
            .pipe(Effect.map(settleBatch))
    ).pipe(Effect.catchTag('SqlError', asJournalError('Could not append the operations')))
    yield* Effect.forEach(outcomes, outcome => announce(key, outcome), { discard: true })
    return outcomes.map(outcome => outcome.result)
  })

  const compact: Shape['compact'] = Effect.fn('Journal.compact')(function* (
    key: DocumentId,
    through: Sequence,
  ) {
    yield* Effect.annotateCurrentSpan({ key, through })
    yield* Effect.gen(function* () {
      const documents = yield* sql<{
        readonly cursor: number
        readonly compact_before: number
      }>`SELECT cursor, compact_before FROM documents WHERE key = ${key}`
      const cursor = toCursor(documents[0]?.cursor ?? 0)
      const compactBefore = toSequence(documents[0]?.compact_before ?? 0)
      if (!Number.isSafeInteger(through) || through < compactBefore || through > cursor)
        return yield* Effect.fail(
          new InvalidCompactionError({
            through,
            cursor,
            floor: compactBefore,
            message: `Cannot compact "${key}" through ${through}`,
          }),
        )
      yield* atomically(
        sql,
        d1,
        Effect.gen(function* () {
          // The stored snapshot must hold everything compacted away, so a lagging one
          // is written at the cursor first.
          const state = yield* materialize(key)
          if (state.snapshotCursor < through) {
            const encoded = yield* Effect.try({
              try: () => JSON.stringify(snapshotCodec.encode(state.snapshot)),
              catch: cause => journalError('Could not compact', cause),
            })
            yield* sql`UPDATE documents SET snapshot = ${encoded}, snapshot_cursor = ${state.cursor} WHERE key = ${key}`
            remember(key, { ...state, snapshotCursor: state.cursor })
          }
          yield* sql`UPDATE operations SET input = NULL WHERE key = ${key} AND sequence <= ${through}`
          yield* sql`UPDATE documents SET compact_before = ${through} WHERE key = ${key}`
        }),
      )
    }).pipe(Effect.catchTag('SqlError', asJournalError('Could not compact')))
    yield* Metric.update(journalMetrics.compactions, 1)
    yield* Effect.logDebug('journal compact', { key, through })
  })

  const vacuum: Shape['vacuum'] = Effect.fn('Journal.vacuum')(function* () {
    // D1 auto-vacuums: there is no file to rebuild and no WAL to checkpoint,
    // so there is nothing to do and nothing to report.
    if (d1) return
    yield* Effect.gen(function* () {
      yield* sql`VACUUM`
      // The client runs in WAL mode, where the rebuilt pages sit in the log until a
      // checkpoint writes them back and the file can be truncated. A reader elsewhere
      // blocks that, which SQLite reports as a row rather than an error.
      const [checkpoint] = yield* sql<{
        readonly busy: number
      }>`PRAGMA wal_checkpoint(TRUNCATE)`
      if (checkpoint !== undefined && Number(checkpoint.busy) !== 0)
        return yield* Effect.fail(
          journalError('Could not vacuum: another connection is reading; try again', undefined),
        )
    }).pipe(Effect.catchTag('SqlError', asJournalError('Could not vacuum')))
  })

  const toEffectRecord = (row: EffectRow): EffectRecord => ({
    key: String(row.key),
    status: String(row.status) as EffectStatus,
    ...(row.result === null ? {} : { result: JSON.parse(String(row.result)) }),
    ...(row.error === null ? {} : { error: String(row.error) }),
  })

  const effect: Shape['effect'] = Effect.fn('Journal.effect')(function* (key: string) {
    yield* Effect.annotateCurrentSpan({ key })
    const rows =
      yield* sql<EffectRow>`SELECT key, status, result, error FROM effects WHERE key = ${key}`.pipe(
        Effect.catchTag('SqlError', asJournalError('Could not read the effect record')),
      )
    const row = rows[0]
    if (row === undefined) return Option.none<EffectRecord>()
    return yield* Effect.try({
      try: () => Option.some(toEffectRecord(row)),
      catch: cause => journalError('Could not read the effect record', cause),
    })
  })

  const keys: Shape['keys'] = Effect.fn('Journal.keys')(function* () {
    const rows = yield* sql<{
      readonly key: string
    }>`SELECT key FROM documents UNION SELECT key FROM operations ORDER BY key`.pipe(
      Effect.catchTag('SqlError', asJournalError('Could not list journal keys')),
    )
    return yield* Effect.try({
      try: () => rows.map(row => toDocumentId(String(row.key))),
      catch: cause => journalError('Could not list journal keys', cause),
    })
  })

  const unfinished: Shape['unfinished'] = Effect.fn('Journal.unfinished')(function* () {
    const rows =
      yield* sql<EffectRow>`SELECT key, status, result, error FROM effects WHERE status != 'succeeded' ORDER BY key`.pipe(
        Effect.catchTag('SqlError', asJournalError('Could not read unfinished effects')),
      )
    return yield* Effect.try({
      try: () => rows.map(toEffectRecord),
      catch: cause => journalError('Could not read unfinished effects', cause),
    })
  })

  const clearEffect: Shape['clearEffect'] = Effect.fn('Journal.clearEffect')(function* (
    key: string,
  ) {
    yield* sql`DELETE FROM effects WHERE key = ${key}`.pipe(
      Effect.catchTag('SqlError', asJournalError('Could not clear the effect record')),
    )
  })

  // The effect ledger is keyed globally and is not reachable by document alone,
  // so `reset` drops the document's snapshot and operations only. Clear the
  // effects a document owns with `clearEffect`, using their full keys.
  const reset: Shape['reset'] = Effect.fn('Journal.reset')(function* (key: DocumentId) {
    yield* atomically(
      sql,
      d1,
      Effect.gen(function* () {
        yield* sql`DELETE FROM operations WHERE key = ${key}`
        yield* sql`DELETE FROM documents WHERE key = ${key}`
        yield* sql`DELETE FROM epochs WHERE key = ${key}`
      }),
    ).pipe(Effect.catchTag('SqlError', asJournalError('Could not reset the document')))
    current.delete(key)
  })

  const record = (
    key: string,
    status: EffectStatus,
    result: unknown,
    error: string | undefined,
  ): Effect.Effect<void, JournalError> =>
    Effect.gen(function* () {
      // Encode before the statement so a non-serializable result is a typed
      // failure, not a defect.
      const encoded = yield* Effect.try({
        try: () => (result === undefined ? null : JSON.stringify(result)),
        catch: cause => journalError('Could not record the effect', cause),
      })
      yield* sql`INSERT INTO effects (key, status, result, error) VALUES (${key}, ${status}, ${encoded}, ${error ?? null}) ON CONFLICT(key) DO UPDATE SET status = excluded.status, result = excluded.result, error = excluded.error`.pipe(
        Effect.catchTag('SqlError', asJournalError('Could not record the effect')),
      )
    })

  const runEffect: Shape['runEffect'] = <Result, E>(
    key: string,
    run: Effect.Effect<Result, E>,
    options?: { readonly retryFailed?: boolean | ((record: EffectRecord) => boolean) },
  ) =>
    Effect.gen(function* () {
      yield* Effect.annotateCurrentSpan({ key })
      // Check-and-reserve is one atomic step, so a concurrent call joins the
      // run already in flight instead of starting a second one.
      const entry = yield* SynchronizedRef.modify(
        inFlight,
        (
          map,
        ): readonly [
          { readonly deferred: Deferred.Deferred<unknown, unknown>; readonly owner: boolean },
          Map<string, Deferred.Deferred<unknown, unknown>>,
        ] => {
          const existing = map.get(key)
          if (existing !== undefined) return [{ deferred: existing, owner: false }, map]
          const created = Deferred.makeUnsafe<unknown, unknown>()
          const next = new Map(map)
          next.set(key, created)
          return [{ deferred: created, owner: true }, next]
        },
      )
      if (!entry.owner) {
        yield* Metric.update(journalMetrics.effectRunsCoalesced, 1)
        return yield* Deferred.await(entry.deferred) as Effect.Effect<Result, E | JournalError>
      }

      return yield* Effect.gen(function* () {
        const recorded = yield* effect(key)
        if (Option.isSome(recorded) && recorded.value.status === 'succeeded') {
          yield* Metric.update(journalMetrics.effectRunsCoalesced, 1)
          return recorded.value.result as Result
        }
        if (
          Option.isSome(recorded) &&
          recorded.value.status === 'failed' &&
          !retriesFailed(options?.retryFailed, recorded.value)
        ) {
          return yield* Effect.fail(
            new EffectFailedError({
              key,
              message: recorded.value.error ?? 'The previous run failed',
            }),
          )
        }

        yield* Metric.update(journalMetrics.effectRuns, 1)
        yield* record(key, 'pending', undefined, undefined)
        return yield* run.pipe(
          Effect.tap(value => record(key, 'succeeded', value, undefined)),
          Effect.tapError(error => record(key, 'failed', undefined, describe(error))),
        )
      }).pipe(
        Effect.onExit(exit =>
          Exit.isSuccess(exit)
            ? Effect.asVoid(Deferred.succeed(entry.deferred, exit.value))
            : Effect.asVoid(Deferred.failCause(entry.deferred, exit.cause)),
        ),
        Effect.ensuring(
          SynchronizedRef.update(inFlight, map => {
            const next = new Map(map)
            next.delete(key)
            return next
          }),
        ),
      )
    })

  const recover: Shape['recover'] = Effect.fn('Journal.recover')(function* (options) {
    const operations = yield* read(options.key, options.from)
    let settled = options.from
    let frozen = false
    for (const committed of operations) {
      if (frozen) break
      for (const intent of options.intents(committed.operation)) {
        const recorded = yield* effect(intent.key)
        if (Option.isSome(recorded) && recorded.value.status === 'succeeded') continue
        const decision = options.onUnresolved?.(intent, recorded) ?? 'retry'
        if (decision === 'skip') {
          frozen = true
          break
        }
        const result = yield* Effect.result(runEffect(intent.key, intent.run))
        if (Result.isFailure(result)) {
          frozen = true
          break
        }
      }
      if (!frozen) settled = toCursor(Number(committed.sequence))
    }
    return settled
  })

  const subscribe: Shape['subscribe'] = Stream.fromPubSub(changes)

  return {
    load,
    cursor,
    epoch,
    floor,
    read,
    append,
    appendAll,
    compact,
    vacuum,
    keys,
    unfinished,
    effect,
    runEffect,
    clearEffect,
    reset,
    recover,
    subscribe,
  }
}
