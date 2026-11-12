/**
 * A prototype of the journal's append path over Effect's EventLog server
 * `Storage` (`effect/eventlog`, `SqlEventLogServerUnencrypted`), for the
 * acceptance criteria of `effect-reuse-sync-durable-DESIGN.md` §14.1. Not a
 * public export and not a replacement: it holds only what the criteria read.
 *
 * Effect owns the entries, their per-store sequence and the change stream;
 * this module owns what an entry means (opId, actor, canonical payload hash)
 * and the snapshot beside it, written in the same SQL transaction.
 */
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'
import { Effect, Option, Stream, type Scope } from 'effect'
import {
  EventJournal,
  EventLogMessage,
  SqlEventLogServerUnencrypted,
  type EventLogServerUnencrypted,
} from 'effect/eventlog'
import { SqlClient } from 'effect/sql'
import {
  CompactedCursorError,
  IdentityConflictError,
  InvalidCompactionError,
  InvalidOperationError,
  type Codec,
  type Cursor,
  type DocumentId,
  type OpId,
} from '../../src/index.js'
import { actorId as toActorId, cursor as toCursor, sequence as toSequence } from '../../src/ids.js'
import type { AppendResult, Committed } from '../../src/journal.js'

export interface PrototypeOptions<Operation, Snapshot> {
  readonly operation: Codec<Operation>
  readonly snapshot: Codec<Snapshot>
  readonly empty: () => Snapshot
  readonly reduce: (snapshot: Snapshot, operation: Operation) => Snapshot
  readonly opId: (operation: Operation) => OpId
}

/** One event name for every operation: Storage keys entries by event and primary key. */
const EVENT = 'foldkit-durable/operation'

/**
 * What an entry's payload holds. After compaction `input` is `null` and the
 * actor and hash stay, so a retry can still be judged.
 */
interface Envelope {
  readonly actor: string
  readonly hash: string
  readonly input: string | null
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const toBytes = (envelope: Envelope): Uint8Array<ArrayBuffer> =>
  new Uint8Array(encoder.encode(JSON.stringify(envelope)))
const fromBytes = (bytes: Uint8Array): Envelope => JSON.parse(decoder.decode(bytes)) as Envelope

const hashPayload = (encoded: string): string => bytesToHex(sha256(utf8ToBytes(encoded)))

/** Sorted keys, as the journal writes them, so equal operations hash equally. */
const canonicalJson = (value: unknown): string => {
  const build = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(build)
    if (input !== null && typeof input === 'object') {
      const out: Record<string, unknown> = Object.create(null)
      for (const key of Object.keys(input).sort())
        out[key] = build((input as Record<string, unknown>)[key])
      return out
    }
    return input
  }
  return JSON.stringify(build(value))
}

/**
 * An opId as an `EntryId`. Effect's ids are UUIDv7 bytes from
 * `makeEntryIdUnsafe`, with no public way in from a string (PR 2); a
 * deterministic 16-byte digest gives a retry the same entry identity, and
 * the opId itself rides in the entry's `primaryKey`.
 */
const entryIdOf = (opId: OpId): EventJournal.EntryId =>
  new Uint8Array(sha256(utf8ToBytes(opId)).slice(0, 16)) as EventJournal.EntryId

const storeOf = (key: DocumentId): EventLogMessage.StoreId => EventLogMessage.StoreId.make(key)

const makeEntry = (opId: OpId, envelope: Envelope): EventJournal.Entry =>
  new EventJournal.Entry(
    { id: entryIdOf(opId), event: EVENT, primaryKey: opId, payload: toBytes(envelope) },
    { disableChecks: true },
  )

export interface PrototypeJournal<Operation, Snapshot> {
  readonly append: (
    key: DocumentId,
    input: unknown,
    actor: string,
  ) => Effect.Effect<AppendResult<Operation>, InvalidOperationError | IdentityConflictError>
  readonly load: (
    key: DocumentId,
  ) => Effect.Effect<{ readonly snapshot: Snapshot; readonly cursor: Cursor }>
  readonly read: (
    key: DocumentId,
    after: Cursor,
  ) => Effect.Effect<ReadonlyArray<Committed<Operation>>, CompactedCursorError>
  readonly compact: (
    key: DocumentId,
    through: number,
  ) => Effect.Effect<void, InvalidCompactionError>
  /** Committed operations after `after`: the backlog, then live commits, in sequence order. */
  readonly changes: (
    key: DocumentId,
    after: Cursor,
  ) => Stream.Stream<Committed<Operation>, CompactedCursorError>
}

export const makePrototype = <Operation, Snapshot>(
  options: PrototypeOptions<Operation, Snapshot>,
): Effect.Effect<PrototypeJournal<Operation, Snapshot>, never, SqlClient.SqlClient | Scope.Scope> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const storage: EventLogServerUnencrypted.Storage['Service'] =
      yield* SqlEventLogServerUnencrypted.makeStorage().pipe(Effect.orDie)
    yield* sql`CREATE TABLE IF NOT EXISTS fk_documents (
        key TEXT PRIMARY KEY, cursor INTEGER NOT NULL, snapshot TEXT NOT NULL,
        compact_before INTEGER NOT NULL DEFAULT 0
      )`.pipe(Effect.orDie)

    const document = (key: DocumentId) =>
      sql<{
        readonly cursor: number
        readonly snapshot: string
        readonly compact_before: number
      }>`SELECT cursor, snapshot, compact_before FROM fk_documents WHERE key = ${key}`.pipe(
        Effect.map(rows =>
          rows[0] === undefined
            ? { cursor: 0, snapshot: options.empty(), floor: 0 }
            : {
                cursor: Number(rows[0].cursor),
                snapshot: options.snapshot.decode(JSON.parse(rows[0].snapshot)),
                floor: Number(rows[0].compact_before),
              },
        ),
        Effect.orDie,
      )

    const committedOf = (remote: EventJournal.RemoteEntry): Committed<Operation> => {
      const envelope = fromBytes(remote.entry.payload)
      if (envelope.input === null) throw new Error('read a compacted entry')
      return {
        operation: options.operation.decode(JSON.parse(envelope.input)),
        opId: remote.entry.primaryKey as OpId,
        sequence: toSequence(remote.remoteSequence),
        actorId: toActorId(envelope.actor),
      }
    }

    /**
     * The stored entry with this opId's entry id. Storage has no point lookup
     * (PR 1); `entriesAfter` given a one-entry batch returns the entries that
     * share its id, or its event and primary key, which is one.
     */
    const lookup = (key: DocumentId, probe: EventJournal.Entry) =>
      storage
        .entriesAfter(storeOf(key), probe, [probe])
        .pipe(
          Effect.map(found =>
            Option.fromNullishOr(found.find(remote => remote.entry.idString === probe.idString)),
          ),
        )

    const append: PrototypeJournal<Operation, Snapshot>['append'] = (key, input, actor) =>
      Effect.gen(function* () {
        const invalid = (cause: unknown) =>
          new InvalidOperationError({ message: 'Invalid operation', cause })
        const operation = yield* Effect.try({
          try: () => options.operation.decode(input),
          catch: invalid,
        })
        const opId = options.opId(operation)
        const encoded = canonicalJson(options.operation.encode(operation))
        const envelope: Envelope = { actor, hash: hashPayload(encoded), input: encoded }
        const entry = makeEntry(opId, envelope)
        return yield* sql
          .withTransaction(
            Effect.gen(function* () {
              const prior = yield* lookup(key, entry)
              if (Option.isSome(prior)) {
                const stored = fromBytes(prior.value.entry.payload)
                if (stored.actor !== actor || stored.hash !== envelope.hash)
                  return yield* Effect.fail(
                    new IdentityConflictError({
                      opId,
                      message: `Operation "${opId}" was reused with different data or actor`,
                    }),
                  )
                const sequence = toSequence(prior.value.remoteSequence)
                return stored.input === null
                  ? ({
                      _tag: 'AlreadyCommitted',
                      opId,
                      sequence,
                      actorId: toActorId(actor),
                    } as const)
                  : ({ _tag: 'Committed', committed: committedOf(prior.value) } as const)
              }
              const state = yield* document(key)
              const reduced = yield* Effect.try({
                try: () => options.reduce(state.snapshot, operation),
                catch: invalid,
              })
              // Written before the snapshot, so a snapshot that fails to encode
              // shows the entry rolled back with it.
              const [written] = yield* storage.write(storeOf(key), [entry])
              if (written!.remoteSequence !== state.cursor + 1)
                return yield* Effect.die(
                  new Error(
                    `Storage allocated ${written!.remoteSequence} at cursor ${state.cursor}`,
                  ),
                )
              const snapshot = yield* Effect.try({
                try: () => JSON.stringify(options.snapshot.encode(reduced)),
                catch: invalid,
              })
              yield* sql`INSERT INTO fk_documents (key, cursor, snapshot) VALUES (${key}, ${written!.remoteSequence}, ${snapshot}) ON CONFLICT(key) DO UPDATE SET cursor = excluded.cursor, snapshot = excluded.snapshot`.pipe(
                Effect.orDie,
              )
              return { _tag: 'Committed', committed: committedOf(written!) } as const
            }),
          )
          .pipe(Effect.catchTag('SqlError', Effect.die))
      })

    const load: PrototypeJournal<Operation, Snapshot>['load'] = key =>
      document(key).pipe(
        Effect.map(state => ({ snapshot: state.snapshot, cursor: toCursor(state.cursor) })),
      )

    const refuseCompacted = (key: DocumentId, after: Cursor) =>
      Effect.gen(function* () {
        const state = yield* document(key)
        if (after < state.floor)
          return yield* Effect.fail(
            new CompactedCursorError({
              after,
              floor: toSequence(state.floor),
              cursor: toCursor(state.cursor),
              message: `Cursor ${after} is below the compaction floor ${state.floor}`,
            }),
          )
        return state
      })

    /**
     * A bounded history read. Storage reads by sequence only through
     * `changes`, which never ends, so the read takes as many as the cursor says.
     */
    const read: PrototypeJournal<Operation, Snapshot>['read'] = (key, after) =>
      Effect.gen(function* () {
        const state = yield* refuseCompacted(key, after)
        if (state.cursor <= after) return []
        return yield* storage
          .changes({ storeId: storeOf(key), startSequence: after + 1, compactors: new Map() })
          .pipe(Stream.take(state.cursor - after), Stream.map(committedOf), Stream.runCollect)
      })

    /**
     * Storage cannot remove or rewrite an entry, so compaction writes Effect's
     * own table, `effect_events`, around the Storage interface.
     */
    const compact: PrototypeJournal<Operation, Snapshot>['compact'] = (key, through) =>
      sql
        .withTransaction(
          Effect.gen(function* () {
            const state = yield* document(key)
            if (through < state.floor || through > state.cursor)
              return yield* Effect.fail(
                new InvalidCompactionError({
                  through: toSequence(through),
                  cursor: toCursor(state.cursor),
                  floor: toSequence(state.floor),
                  message: `Cannot compact "${key}" through ${through}`,
                }),
              )
            const rows = yield* sql<{
              readonly sequence: number
              readonly payload: Uint8Array
            }>`SELECT sequence, payload FROM effect_events WHERE store_id = ${key} AND sequence <= ${through}`
            for (const row of rows) {
              const { actor, hash } = fromBytes(row.payload)
              yield* sql`UPDATE effect_events SET payload = ${toBytes({ actor, hash, input: null })} WHERE store_id = ${key} AND sequence = ${row.sequence}`
            }
            yield* sql`UPDATE fk_documents SET compact_before = ${through} WHERE key = ${key}`
          }),
        )
        .pipe(Effect.catchTag('SqlError', Effect.die))

    const changes: PrototypeJournal<Operation, Snapshot>['changes'] = (key, after) =>
      Stream.unwrap(
        refuseCompacted(key, after).pipe(
          Effect.map(() =>
            storage
              .changes({ storeId: storeOf(key), startSequence: after + 1, compactors: new Map() })
              .pipe(Stream.map(committedOf)),
          ),
        ),
      )

    return { append, load, read, compact, changes }
  })
