/** What the browser keeps of the list, per actor: `app.ts`'s `remoteCache` stores it. */
import { entityKey, type Edge, type RemoteModel } from 'foldkit-remote'
import { RemotePersistence, type Snapshot } from 'foldkit-remote/persistence'
import { AllTodos } from './operations.js'

export const cacheKey = (actor: string): string => `foldkit-crud-cache:${actor}`

/** An edge whose entity the base store holds. A pending insert lives only in a layer. */
const inStore = (remote: RemoteModel, edge: Edge): boolean => {
  const entry = remote.entities[entityKey(edge.ref.entity, edge.ref.id)]
  return entry !== undefined && entry.tombstone === false
}

/**
 * The server's rows for `AllTodos`, as the page shows them: a live insert
 * stays an overlay, so the connection's own segments would drop a row another
 * tab wrote, and `shown` (the domain's `visibleItems`) draws it in its place.
 * A connection that was never loaded is left out. One that loaded empty keeps
 * one empty segment, so the next visit can say there is nothing to do instead
 * of loading.
 */
export const snapshotFor = (
  remote: RemoteModel,
  shown: (remote: RemoteModel, connection: string) => ReadonlyArray<Edge>,
): Snapshot => {
  const ref = AllTodos.ref({})
  const base = RemotePersistence.snapshotOf(remote, { connections: [ref.identity] })
  const identity = ref.identity
  if (base.connections[identity] === undefined) return base
  // An edge whose row the snapshot does not hold cannot assemble, and the
  // whole list would fail.
  const edges = shown(remote, identity).filter(edge => inStore(remote, edge))
  return { entities: base.entities, connections: { [identity]: [edges] } }
}
