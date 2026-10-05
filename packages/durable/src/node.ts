/**
 * The journal over a `node:sqlite` file: `Journal.make`, its layer, and its
 * service definition. The journal itself is `journal.ts`, over any SQL
 * client; this is the one place Node's driver is imported, so a browser
 * bundle reaches `foldkit-durable/core` without it.
 */
import * as SqliteClient from '@effect/sql-sqlite-node/SqliteClient'
import { Config, Effect, Layer } from 'effect'
import { JournalError, UnsupportedJournalVersionError } from './errors.js'
import {
  journalMetrics,
  makeJournalOn,
  type Journal as JournalShape,
  type JournalOptions,
} from './journal.js'
import { JournalService } from './service.js'

/**
 * A durable journal; see `journal.ts`. Declared here beside the `Journal`
 * namespace, since a type and a const of one name must come from one module.
 */
export type Journal<Operation, Snapshot, Principal, OperationEncoded = unknown> = JournalShape<
  Operation,
  Snapshot,
  Principal,
  OperationEncoded
>

const resolveFile = (file: string | Config.Config<string>): Effect.Effect<string, JournalError> =>
  typeof file === 'string'
    ? Effect.succeed(file)
    : file.pipe(
        Effect.catchTag('ConfigError', cause =>
          Effect.fail(new JournalError({ message: 'Could not read the journal file', cause })),
        ),
      )

/**
 * Opens a durable, ordered operation log with a snapshot and cursor per key.
 *
 * Append is atomic and idempotent by `opId`; committed order is stable; the
 * snapshot and cursor are consistent; and compaction drops payloads without
 * changing what a replay of the compacted prefix would produce. The journal
 * understands storage and ordering, never application semantics: `reduce` is
 * the application's own transition function. The SQLite connection is released
 * when the effect's scope closes.
 */
export const makeJournal = Effect.fn('Journal.make')(function* <
  Operation,
  Snapshot,
  Principal,
  OperationEncoded = unknown,
  SnapshotEncoded = unknown,
>(options: JournalOptions<Operation, Snapshot, Principal, OperationEncoded, SnapshotEncoded>) {
  const file = yield* resolveFile(options.file)
  // Build the driver into the journal's own scope, not the transient scope of
  // this effect, so the connection outlives `makeJournal`.
  const context = yield* Layer.build(SqliteClient.layer({ filename: file }))
  return yield* makeJournalOn(options).pipe(Effect.provide(context))
})

export { JournalService }

/** Provides the journal as a scoped layer, releasing the database when the layer closes. */
export const makeJournalLayer = <
  Operation,
  Snapshot,
  Principal,
  OperationEncoded = unknown,
  SnapshotEncoded = unknown,
>(
  options: JournalOptions<Operation, Snapshot, Principal, OperationEncoded, SnapshotEncoded>,
  key = 'foldkit-durable/Journal',
): Layer.Layer<
  JournalShape<Operation, Snapshot, Principal, OperationEncoded>,
  JournalError | UnsupportedJournalVersionError
> =>
  Layer.effect(
    JournalService<Operation, Snapshot, Principal, OperationEncoded>(key),
    makeJournal(options),
  )

/**
 * One journal's service tag together with the layer that satisfies it, both
 * built from the same type parameters, so the tag cannot be read back as a
 * journal of some other shape.
 */
export interface JournalDefinition<Operation, Snapshot, Principal, OperationEncoded = unknown> {
  readonly key: string
  readonly tag: ReturnType<typeof JournalService<Operation, Snapshot, Principal, OperationEncoded>>
  readonly layer: <SnapshotEncoded = unknown>(
    options: JournalOptions<Operation, Snapshot, Principal, OperationEncoded, SnapshotEncoded>,
  ) => Layer.Layer<
    JournalShape<Operation, Snapshot, Principal, OperationEncoded>,
    JournalError | UnsupportedJournalVersionError
  >
}

const defineJournal = <Operation, Snapshot, Principal, OperationEncoded = unknown>(
  key: string,
): JournalDefinition<Operation, Snapshot, Principal, OperationEncoded> => ({
  key,
  tag: JournalService<Operation, Snapshot, Principal, OperationEncoded>(key),
  layer: options => makeJournalLayer(options, key),
})

export const Journal = {
  /** Opens a journal in the current scope. */
  make: makeJournal,
  /** Provides a journal as a scoped layer under the default service key. */
  layer: makeJournalLayer,
  /** Counters an application can scrape. */
  metrics: journalMetrics,
  /**
   * Declares a journal's service key and its type parameters once, and returns
   * the tag and the layer constructor that agree on them.
   *
   * ```ts
   * const TodoJournal = Journal.define<Operation, Snapshot, Principal>('app/TodoJournal')
   * const layer = TodoJournal.layer(options)
   * const journal = yield* TodoJournal.tag
   * ```
   */
  define: defineJournal,
}
