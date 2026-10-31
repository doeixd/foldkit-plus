/**
 * A map of what was used most recently, for caches keyed by a string that
 * nothing frees (an id, an entity key): two generations of at most `size`
 * each, the older dropped whole when the newer fills, so it holds at most
 * `2 × size` and a key used in the last `size` sets is never lost. A key
 * found in the older generation moves to the newer.
 */
export interface Recent<K, V> {
  readonly get: (key: K) => V | undefined
  readonly set: (key: K, value: V) => void
}

export const recent = <K, V>(size: number): Recent<K, V> => {
  let newer = new Map<K, V>()
  let older = new Map<K, V>()
  const set = (key: K, value: V): void => {
    if (newer.size >= size && !newer.has(key)) {
      older = newer
      newer = new Map()
    }
    newer.set(key, value)
  }
  return {
    get: key => {
      const held = newer.get(key)
      if (held !== undefined) return held
      const kept = older.get(key)
      if (kept !== undefined) set(key, kept)
      return kept
    },
    set,
  }
}
