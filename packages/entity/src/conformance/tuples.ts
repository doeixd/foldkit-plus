/** A small seeded generator (mulberry32), so a chosen subset is the same on every run. */
const random = (seed: number) => {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * At most `limit` tuples of one value from each list, chosen by `seed` when
 * there are more. Their number is the lists' lengths multiplied, exponential
 * in how many there are, so none is built but those chosen: a partial
 * Fisher-Yates shuffle over their indices, holding only the indices it moved.
 */
export const tuplesOf = <A>(
  lists: ReadonlyArray<ReadonlyArray<A>>,
  limit: number,
  seed: number,
): ReadonlyArray<ReadonlyArray<A>> => {
  const size = lists.reduce((count, list) => count * list.length, 1)
  // The index-th tuple, the last list varying fastest.
  const at = (index: number): ReadonlyArray<A> => {
    const tuple = new Array<A>(lists.length)
    let rest = index
    for (let i = lists.length - 1; i >= 0; i--) {
      const list = lists[i]!
      tuple[i] = list[rest % list.length]!
      rest = Math.floor(rest / list.length)
    }
    return tuple
  }
  if (size <= limit) return Array.from({ length: size }, (_, index) => at(index))
  const next = random(seed)
  const moved = new Map<number, number>()
  return Array.from({ length: limit }, (_, i) => {
    const j = i + Math.floor(next() * (size - i))
    const picked = moved.get(j) ?? j
    moved.set(j, moved.get(i) ?? i)
    return at(picked)
  })
}
