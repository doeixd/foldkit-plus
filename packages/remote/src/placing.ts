/**
 * Placing changed rows in the lists that hold them, by each list's body: what a
 * read, a write's answer and a pending layer all do to a loaded list.
 */
import { Option } from 'effect'
import type { ExprContext } from 'foldkit-entity'
import type { Lists } from './capability.js'
import { items, type Connection } from './connection.js'
import { EntityChange, Impact, impactOn } from './impact.js'
import { entityKey, type EntityStore } from './store.js'

/**
 * `pages` with each change to a row they hold placed, judged against
 * `store`: a row that moved goes where the body's order puts it, and one
 * that stopped matching leaves. A row a pending write creates joins where
 * the body puts it, since the write holds all it is. Another row a change
 * brings in is not added, since what the list selects of it may not be
 * loaded, and a change the client cannot place leaves the row where it is.
 */
export const placedHeld = (
  lists: Lists,
  identity: string,
  pages: Connection,
  changes: ReadonlyArray<EntityChange>,
  store: EntityStore,
  // For pending placement, the viewer its operations were predicted for; none
  // when no operation named one, and a body over the context is the server's.
  context?: ExprContext,
): Connection => {
  const query = lists.queryOf(identity)
  if (Option.isNone(query)) return pages
  // Built once: each change is of a row of its own, judged against the store
  // as every change left it, so what the list held before them all is enough.
  const holds = new Set(items(pages).map(edge => entityKey(edge.ref.entity, edge.ref.id)))
  let placed = pages
  for (const change of changes) {
    const created = EntityChange.match(change, {
      Changed: ({ created }) => created,
      Deleted: () => false,
    })
    if (!holds.has(entityKey(change.entity, change.id)) && !created) continue
    placed = Impact.$match(
      impactOn(
        { ...query.value, connection: placed, holds },
        store,
        change,
        lists.operators,
        context,
      ),
      {
        Kept: () => placed,
        Placed: ({ connection }) => connection,
        Invalidated: () => placed,
      },
    )
  }
  return placed
}
