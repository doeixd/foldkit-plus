/**
 * The journal as a service over any `effect/sql` SQLite client: its tag, and a
 * layer that needs the `SqlClient` it runs over. A layer, not a value, so the
 * database lives exactly as long as the journal: `Layer.provide` the driver
 * and both are released together.
 */
import { Context, Layer } from 'effect'
import type { SqlClient } from 'effect/sql'
import type { JournalError, UnsupportedJournalVersionError } from './errors.js'
import {
  journalMetrics,
  makeJournalOn,
  type Journal as JournalShape,
  type JournalStoreOptions,
} from './journal.js'

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

/**
 * The journal as a service, so an application composes it with `Effect.provide`
 * instead of threading the shape through its own wiring. Pass the codec's
 * `Encoded` type as the fourth parameter when it is not `unknown`, and use a
 * distinct `key` if the application runs more than one journal.
 *
 * Prefer `Journal.define`. The type arguments here are supplied at each use
 * site and nothing checks them against the layer that satisfied the tag, so
 * `yield* JournalService<SomeOtherOperation, ...>('app/Journal')` compiles and
 * hands back a journal typed as something it is not — the key is the only real
 * identity. `Journal.define` fixes the parameters once and derives both the tag
 * and its layer from them.
 */
export const JournalService = <Operation, Snapshot, Principal, OperationEncoded = unknown>(
  key = 'foldkit-durable/Journal',
) =>
  Context.Service<
    JournalShape<Operation, Snapshot, Principal, OperationEncoded>,
    JournalShape<Operation, Snapshot, Principal, OperationEncoded>
  >()(key)

/** The journal over the `SqlClient` the layer is given, under `key`. */
const layerOn = <
  Operation,
  Snapshot,
  Principal,
  OperationEncoded = unknown,
  SnapshotEncoded = unknown,
>(
  options: JournalStoreOptions<Operation, Snapshot, Principal, OperationEncoded, SnapshotEncoded>,
  key = 'foldkit-durable/Journal',
): Layer.Layer<
  JournalShape<Operation, Snapshot, Principal, OperationEncoded>,
  JournalError | UnsupportedJournalVersionError,
  SqlClient.SqlClient
> =>
  Layer.effect(
    JournalService<Operation, Snapshot, Principal, OperationEncoded>(key),
    makeJournalOn(options),
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
    options: JournalStoreOptions<Operation, Snapshot, Principal, OperationEncoded, SnapshotEncoded>,
  ) => Layer.Layer<
    JournalShape<Operation, Snapshot, Principal, OperationEncoded>,
    JournalError | UnsupportedJournalVersionError,
    SqlClient.SqlClient
  >
}

export const Journal = {
  /**
   * The journal as a layer over the `SqlClient` it is given, under the
   * default service key. Provide the driver to the layer, not to an effect,
   * and the database opens and closes with it.
   */
  layer: layerOn,
  /** Counters an application can scrape. */
  metrics: journalMetrics,
  /**
   * Declares a journal's service key and its type parameters once, and returns
   * the tag and the layer constructor that agree on them.
   *
   * ```ts
   * const Todos = Journal.define<Operation, Snapshot, Principal>('app/Todos')
   * const live = Todos.layer(options).pipe(Layer.provide(WasmClient.layerMemory({})))
   * const journal = yield* Todos.tag
   * ```
   */
  define: <Operation, Snapshot, Principal, OperationEncoded = unknown>(
    key: string,
  ): JournalDefinition<Operation, Snapshot, Principal, OperationEncoded> => ({
    key,
    tag: JournalService<Operation, Snapshot, Principal, OperationEncoded>(key),
    layer: options => layerOn(options, key),
  }),
}
