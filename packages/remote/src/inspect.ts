/** A serializable summary of a RemoteModel for DevTools and diagnostics. */
import type { Dependencies } from 'foldkit-entity'
import type { Failures, RemoteModel } from './model.js'
import type { QueryWindow } from './query.js'
import type { RemoteData } from './remoteData.js'
import type { RelationRequirement } from './requirement.js'
import type { EntityEntry } from './store.js'

/** A serializable summary of a RemoteModel for DevTools and diagnostics. */
export interface RemoteInspection {
  readonly entities: ReadonlyArray<{
    readonly key: string
    readonly present: ReadonlyArray<string>
    readonly stale: ReadonlyArray<string>
    readonly unavailable: ReadonlyArray<string>
    readonly tombstone: boolean
    readonly updatedAt: number
    readonly windows: Readonly<Record<string, string>>
  }>
  readonly connections: ReadonlyArray<string>
  readonly live: ReadonlyArray<string>
  readonly gaps: ReadonlyArray<string>
  /**
   * The `entity\0id\0field` marks of reads in flight, and a
   * `\0connection\0identity` mark for each query in flight. This is what "Remote is
   * working" means here, and it is read from the Model rather than from the
   * fibers doing the work: a tool that shows it shows something the Model can
   * be replayed to, and nothing that needs the runtime to be asked.
   */
  readonly loading: ReadonlyArray<string>
  /**
   * The reads that failed and are not yet settled: queries by connection
   * identity, entity fields by `entity\0id\0field` mark, each with its error.
   */
  readonly failures: Failures
  readonly mutations: {
    readonly pending: ReadonlyArray<string>
    readonly failed: ReadonlyArray<string>
    readonly applied: number
  }
}

const inspectEntry = (key: string, entry: EntityEntry): RemoteInspection['entities'][number] => ({
  key,
  present: [...entry.present],
  stale: [...entry.stale],
  unavailable: [...entry.unavailable],
  tombstone: entry.tombstone,
  updatedAt: entry.updatedAt,
  windows: { ...entry.windows },
})

/** A pure, serializable view of the whole cache. */
export const inspectRemote = (model: RemoteModel): RemoteInspection => ({
  entities: Object.entries(model.entities).map(([key, entry]) => inspectEntry(key, entry)),
  connections: Object.keys(model.connections),
  live: Object.keys(model.live),
  gaps: [...model.gaps],
  loading: [...model.loading],
  failures: model.failures,
  mutations: {
    pending: [...model.mutations.pending],
    failed: [...model.mutations.failed],
    applied: model.mutations.applied.size,
  },
})

/** A pure, serializable view of one entity, or `undefined` if unknown. */
export const inspectEntity = (
  model: RemoteModel,
  key: string,
): RemoteInspection['entities'][number] | undefined => {
  const entry = model.entities[key]
  return entry === undefined ? undefined : inspectEntry(key, entry)
}

/**
 * Why a read shows what it shows, in words, and for `Initial`, which of the
 * usual mistakes it is.
 *
 * `Initial` means nothing is fetching the read, and that is almost always
 * wiring rather than the network: no active Surface reads it, or one does and
 * Remote's Subscriptions are not running. The Model can tell those apart when
 * it is given the active record, so this says which, and what to do.
 */
export interface ReadDiagnosis {
  readonly state: RemoteData<unknown>['_tag']
  /**
   * For `Initial` only. `NotObserved`: no active Surface reads it.
   * `NotFetching`: one does, and nothing is fetching it, so Remote's
   * Subscriptions are most likely not installed. `Unknown`: no active record
   * was given to tell.
   */
  readonly reason?: 'NotObserved' | 'NotFetching' | 'Unknown' | undefined
  /** One or two sentences a developer can act on. */
  readonly message: string
  /** The active Surfaces reading it, when the active record was given. */
  readonly surfaces?: ReadonlyArray<string> | undefined
}

/**
 * What one query read is, and what it currently is — data-query-DESIGN §29.1.
 *
 * Every member is gathered from something that already existed: the read was
 * always this many pieces, and nothing had ever been asked to put them in one
 * place. It is plain serializable data, so a DevTools panel, a log line and a
 * test assert on the same value.
 *
 * Two members of §29.1's sketch are **not** here, and their absence is the
 * finding rather than an omission:
 *
 * - **Surface.** A Projection does not know which Surface reads it, and often
 *   several do — so it is not a property of the read, and `explain` cannot
 *   recover it alone. Given the active Surfaces (the same record
 *   `subscriptions` takes), it reports **every** Surface reading the connection
 *   rather than guessing one, and omits the member entirely when it was not
 *   given them.
 * - **Executor.** The thing that answers a query is a `RemoteClient` Layer in
 *   the runtime, not a value in the Model, and a pure read of the Model cannot
 *   see it. That is the same boundary that makes this function pure and
 *   replayable, so it is worth more than the line of text.
 *
 * And one that the design proposed and this does not want: *expectation*
 * (required versus optional). §11 left it unbuilt for want of a consumer, and
 * the explanation was the likeliest consumer. It turns out not to need it — a
 * query's result is a connection, so the shape is a `Page`, decided by the
 * definition rather than by the read. Nothing here has an opinion about whether
 * an empty one is an error, because nothing here has to have one.
 */
export interface QueryExplanation {
  /** The bound Remote domain that answers it. */
  readonly domain: string
  /** The definition's name. */
  readonly query: string
  /** The input as encoded, which is what the identity is built from. */
  readonly input: unknown
  /** The connection identity: definition plus canonical input, excluding the window. */
  readonly identity: string
  /** How much of the connection this read asks for. */
  readonly window: QueryWindow
  /** What it reads of each item, as the slice asked of the server. */
  readonly select: RelationRequirement
  /**
   * What the query means, as readable text — `Query.show`, and so neither SQL
   * nor whatever the backend compiled. Absent for a definition made with
   * `Query.make`, whose meaning lives on the server that answers it.
   */
  readonly body?: string | undefined
  /** The fields, inputs and operations the body reads; absent with the body. */
  readonly dependencies?: Dependencies | undefined
  /** What the read answers from this Model right now. */
  readonly state: RemoteData<unknown>['_tag']
  /**
   * The active Surfaces reading this connection at this Model, if the active
   * record was supplied. Plural because several may, which is why a Projection
   * cannot carry the answer itself.
   */
  readonly surfaces?: ReadonlyArray<string> | undefined
  /**
   * Why each of those Surfaces is active, where it was placed with
   * `Surface.when` — the Model path and the tag, without running anything. A
   * Surface placed with `Surface.at` has no entry: a callback cannot be read.
   */
  readonly activation?:
    | ReadonlyArray<{
        readonly surface: string
        readonly path: readonly string[]
        readonly tag: string
      }>
    | undefined
}
