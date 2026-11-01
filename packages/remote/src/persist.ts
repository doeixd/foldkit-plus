/**
 * What a `Data.subscriptions` call says of saving what it reads, carried on
 * the retention roots it reads, so `persistence(Data, …)` judges each saved
 * row and list by the calls that read it, departed ones included.
 */
import type { RetentionRoots } from './retain.js'
import { entityKey } from './store.js'

/** How long a saved copy of what a root reads lasts, in milliseconds; `false` saves none. */
export type Persist = number | false

/** A call's `persist`: `{ maxAge }` in milliseconds, or `false` to save none of what it reads. */
export type PersistOption = false | { readonly maxAge: number }

/** A call's `persist` as its roots carry it, refused where it is given when no age is one. */
export const persistOf = (option: PersistOption | undefined): Persist | undefined => {
  if (option === undefined || option === false) return option
  return checkedMaxAge(option.maxAge)
}

/** A `maxAge` given, refused when it is not 0 or more milliseconds. */
export const checkedMaxAge = (maxAge: number): number => {
  if (!(maxAge >= 0))
    throw new Error(
      `[foldkit-remote] maxAge is how long a saved read lasts, in milliseconds, 0 or more (Infinity for no limit); got ${maxAge}`,
    )
  return maxAge
}

/** What two calls reading one root say together: `false` wins, else the longer age. */
export const combinePersist = (said: Persist | undefined, also: Persist): Persist => {
  if (said === undefined) return also
  if (said === false || also === false) return false
  return Math.max(said, also)
}

/** Every root of `roots` carrying `persist`, or `roots` itself when there is none. */
export const marked = (roots: RetentionRoots, persist: Persist | undefined): RetentionRoots =>
  persist === undefined
    ? roots
    : {
        requirements: roots.requirements.map(root => ({ ...root, persist })),
        connections: roots.connections.map(root => ({ ...root, persist })),
      }

/**
 * `roots` with each read and list that one of `said` marks carrying what they
 * say together. A root no call marks carries nothing: a call that names no
 * `persist` leaves the choice to one that does.
 */
export const withPersist = (
  roots: RetentionRoots,
  said: ReadonlyArray<RetentionRoots>,
): RetentionRoots => {
  if (said.length === 0) return roots
  const reads = new Map<string, Persist>()
  const lists = new Map<string, Persist>()
  for (const each of said) {
    for (const { entity, id, persist } of each.requirements) {
      if (persist === undefined) continue
      const key = entityKey(entity, id)
      reads.set(key, combinePersist(reads.get(key), persist))
    }
    for (const { identity, persist } of each.connections) {
      if (persist !== undefined) lists.set(identity, combinePersist(lists.get(identity), persist))
    }
  }
  return {
    requirements: roots.requirements.map(root => {
      const persist = reads.get(entityKey(root.entity, root.id))
      return persist === undefined ? root : { ...root, persist }
    }),
    connections: roots.connections.map(root => {
      const persist = lists.get(root.identity)
      return persist === undefined ? root : { ...root, persist }
    }),
  }
}
