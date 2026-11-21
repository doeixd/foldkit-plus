/**
 * Which rows a write changed, for `foldkit-remote/aggregate` (#580): each write in
 * `store.ts` reports the copy, its source and the keys it replaced. A store made any
 * other way reports nothing, and a reader then reads the whole store again. Nothing
 * listens until an aggregate asks to.
 */
import type { EntityEntry, EntityKey, EntityStore } from './store.js'

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

/** A write to the store: copied at the first `set`, `end` reports it (the given store if none). */
export const editing = (store: EntityStore) => {
  let next: Record<EntityKey, EntityEntry> | undefined
  const keys: EntityKey[] = []
  return {
    get: (key: EntityKey): EntityEntry | undefined => (next ?? store)[key],
    set: (key: EntityKey, entry: EntityEntry): void => {
      next ??= { ...store }
      keys.push(key)
      next[key] = entry
    },
    end: (): EntityStore => stepped(store, next, keys),
  }
}
