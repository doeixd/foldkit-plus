/** A serializable summary of a RemoteModel for DevTools and diagnostics. */
import type { RemoteModel } from './model.js'
import type { EntityEntry } from './store.js'

/** A serializable summary of a RemoteModel for DevTools and diagnostics. */
export interface RemoteInspection {
  readonly entities: ReadonlyArray<{
    readonly key: string
    readonly present: ReadonlyArray<string>
    readonly stale: ReadonlyArray<string>
    readonly tombstone: boolean
    readonly updatedAt: number
    readonly windows: Readonly<Record<string, string>>
  }>
  readonly connections: ReadonlyArray<string>
  readonly live: ReadonlyArray<string>
  readonly gaps: ReadonlyArray<string>
  /**
   * The `entity\0id\0field` marks of reads in flight. This is what "Remote is
   * working" means here, and it is read from the Model rather than from the
   * fibers doing the work: a tool that shows it shows something the Model can
   * be replayed to, and nothing that needs the runtime to be asked.
   */
  readonly loading: ReadonlyArray<string>
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
