/**
 * Order and reverse indexes for maintained values (Phase 4 Part B, Bout 4.16).
 *
 * Built only when a maintained source exceeds `INDEX_THRESHOLD` (400 rows,
 * decision 22) so small lists pay zero index overhead.
 */
import { Option } from 'effect'
import type { EntityKey } from '../store.js'

/** Row count above which an order or reverse index is built (decision 22). */
export const INDEX_THRESHOLD = 400 as const

export interface OrderEntry<K> {
  readonly key: EntityKey
  readonly sortKey: K
}

export interface OrderIndex<K> {
  readonly size: number
  /** Find the insertion position for `(sortKey, key)` in O(log n) comparisons. */
  readonly positionOf: (sortKey: K, key: EntityKey) => number
  /** Insert `(key, sortKey)` in sorted order and return the insertion index. */
  readonly insert: (key: EntityKey, sortKey: K) => number
  /** Remove `key` (at its old `sortKey`) and return whether it was present. */
  readonly remove: (key: EntityKey, sortKey: K) => boolean
  /** Current keys in sorted order. */
  readonly keys: () => ReadonlyArray<EntityKey>
}

/**
 * Build a sorted order index over `entries`, ordered by `compare(a, b)` with
 * `EntityKey` tie-break for uniqueness.
 */
export const makeOrderIndex = <K>(
  entries: ReadonlyArray<OrderEntry<K>>,
  compare: (a: K, b: K) => number,
): OrderIndex<K> => {
  const cmp = (aKey: K, aId: EntityKey, bKey: K, bId: EntityKey): number => {
    const primary = compare(aKey, bKey)
    if (primary !== 0) return primary
    return aId < bId ? -1 : aId > bId ? 1 : 0
  }

  const keyToSort = new Map<EntityKey, K>()
  for (const entry of entries) keyToSort.set(entry.key, entry.sortKey)
  const sorted: Array<OrderEntry<K>> = Array.from(keyToSort, ([key, sortKey]) => ({
    key,
    sortKey,
  })).sort((a, b) => cmp(a.sortKey, a.key, b.sortKey, b.key))

  const positionOf = (sortKey: K, key: EntityKey): number => {
    let lo = 0
    let hi = sorted.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      const entry = sorted[mid]!
      if (cmp(sortKey, key, entry.sortKey, entry.key) <= 0) {
        hi = mid
      } else {
        lo = mid + 1
      }
    }
    return lo
  }

  const removeAt = (key: EntityKey, sortKey: K): boolean => {
    const at = positionOf(sortKey, key)
    const existing = sorted[at]
    if (existing === undefined || existing.key !== key) return false
    sorted.splice(at, 1)
    keyToSort.delete(key)
    return true
  }

  return {
    get size() {
      return sorted.length
    },
    positionOf,
    insert: (key, sortKey) => {
      if (keyToSort.has(key)) {
        const oldSortKey = keyToSort.get(key)!
        if (compare(oldSortKey, sortKey) === 0) {
          const at = positionOf(oldSortKey, key)
          sorted[at] = { key, sortKey }
          keyToSort.set(key, sortKey)
          return at
        }
        removeAt(key, oldSortKey)
      }
      const at = positionOf(sortKey, key)
      sorted.splice(at, 0, { key, sortKey })
      keyToSort.set(key, sortKey)
      return at
    },
    remove: removeAt,
    keys: () => sorted.map(e => e.key),
  }
}

/** Build an `OrderIndex` only when `entries.length > threshold` (default `INDEX_THRESHOLD = 400`). */
export const maybeOrderIndex = <K>(
  entries: ReadonlyArray<OrderEntry<K>>,
  compare: (a: K, b: K) => number,
  threshold: number = INDEX_THRESHOLD,
): Option.Option<OrderIndex<K>> =>
  entries.length > threshold ? Option.some(makeOrderIndex(entries, compare)) : Option.none()

export interface ReverseIndex {
  /** Number of distinct target ids currently indexed. */
  readonly targetCount: number
  /** Record that `sourceKey` points at `targetId`. */
  readonly add: (targetId: string, sourceKey: EntityKey) => void
  /** Remove the link from `sourceKey` to `targetId`. */
  readonly remove: (targetId: string, sourceKey: EntityKey) => void
  /** All source keys currently pointing at `targetId` (O(1) lookup). */
  readonly pointingAt: (targetId: string) => ReadonlySet<EntityKey>
}

const EMPTY_SET: ReadonlySet<EntityKey> = new Set()

/** Build a reverse index mapping `targetId -> Set<sourceKey>` for O(1) join lookups. */
export const makeReverseIndex = (
  links: ReadonlyArray<readonly [targetId: string, sourceKey: EntityKey]>,
): ReverseIndex => {
  const map = new Map<string, Set<EntityKey>>()
  const add = (targetId: string, sourceKey: EntityKey): void => {
    let set = map.get(targetId)
    if (set === undefined) {
      set = new Set()
      map.set(targetId, set)
    }
    set.add(sourceKey)
  }
  const remove = (targetId: string, sourceKey: EntityKey): void => {
    const set = map.get(targetId)
    if (set === undefined) return
    set.delete(sourceKey)
    if (set.size === 0) map.delete(targetId)
  }
  for (const [targetId, sourceKey] of links) {
    add(targetId, sourceKey)
  }
  return {
    get targetCount() {
      return map.size
    },
    add,
    remove,
    pointingAt: targetId => map.get(targetId) ?? EMPTY_SET,
  }
}

/** Build a `ReverseIndex` only when `links.length > threshold` (default `INDEX_THRESHOLD = 400`). */
export const maybeReverseIndex = (
  links: ReadonlyArray<readonly [targetId: string, sourceKey: EntityKey]>,
  threshold: number = INDEX_THRESHOLD,
): Option.Option<ReverseIndex> =>
  links.length > threshold ? Option.some(makeReverseIndex(links)) : Option.none()
