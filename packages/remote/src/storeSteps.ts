/**
 * Which rows a write changed, for a reader that keeps a value derived from
 * many rows (`foldkit-remote/aggregate`, #580). Each write in `store.ts`
 * copies the store and replaces some entries; it reports the copy, what it was
 * copied from, and the keys it replaced, so a reader can follow a row's
 * changes without comparing every key. A store made any other way (a
 * hydrated snapshot, a principal's change, eviction) reports nothing, and a
 * reader that cannot connect two stores reads the whole store again.
 *
 * Nothing listens until a reader asks to: a page that keeps no derived value
 * pays one comparison per write.
 */
import type { EntityKey, EntityStore } from './store.js'

type Watcher = (from: EntityStore, to: EntityStore, keys: ReadonlyArray<EntityKey>) => void

let watcher: Watcher | undefined

/** Starts reporting each store a write makes. One listener: the second call replaces the first. */
export const watchStoreSteps = (watch: Watcher): void => {
  watcher = watch
}

/** What a write returns: `to` when it copied the store (reported with the keys it wrote), else `from`. */
export const stepped = (
  from: EntityStore,
  to: EntityStore | undefined,
  keys: ReadonlyArray<EntityKey>,
): EntityStore => {
  if (to === undefined) return from
  watcher?.(from, to, keys)
  return to
}
