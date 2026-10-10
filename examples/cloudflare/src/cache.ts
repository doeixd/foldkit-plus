/** What the browser keeps of the list, per actor: `app.ts`'s `persistence` stores it. */
import {
  Remote,
  RemotePersistence,
  entityKey,
  type Edge,
  type RemoteModel,
  type Snapshot,
} from 'foldkit-remote'
import { AllTodos } from './operations.js'

/** The live subscription watches this id, never a real row. It is not stored. */
export const LIST_WATCH = 'foldkit-watch'

const WATCH_KEY = entityKey('Todo', LIST_WATCH)

export const cacheKey = (actor: string): string => `foldkit-crud-cache:${actor}`

/** An edge whose entity the base store holds. A pending insert lives only in a layer. */
const inStore = (remote: RemoteModel, edge: Edge): boolean => {
  const entry = remote.entities[entityKey(edge.ref.entity, edge.ref.id)]
  return entry !== undefined && entry.tombstone === false
}

const withoutWatch = (snapshot: Snapshot): Snapshot => {
  if (!Object.hasOwn(snapshot.entities, WATCH_KEY)) return snapshot
  const entities = { ...snapshot.entities }
  delete entities[WATCH_KEY]
  return { entities, connections: snapshot.connections }
}

/**
 * The server's rows for `AllTodos`. Confirmed inserts stay overlays, so the
 * connection's own segments would drop a row just written; the visible edges
 * are what the page shows. A connection that was never loaded is left out.
 * One that loaded empty keeps one empty segment, so the next visit can say
 * there is nothing to do instead of loading.
 */
export const snapshotFor = (remote: RemoteModel): Snapshot => {
  const ref = AllTodos.ref({})
  const base = RemotePersistence.snapshotOf(remote, { connections: [ref.identity] })
  const identity = ref.identity
  if (base.connections[identity] === undefined) return withoutWatch(base)
  // The watch id is not a todo. An edge kept after its entity is stripped
  // cannot assemble, and the whole list fails.
  const edges = Remote.visibleItems(remote, identity).filter(
    edge => edge.ref.id !== LIST_WATCH && inStore(remote, edge),
  )
  return withoutWatch({
    entities: base.entities,
    connections: { [identity]: [edges] },
  })
}
