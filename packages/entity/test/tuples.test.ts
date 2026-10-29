/** Choosing argument tuples without building every one of them (#318). */
import { describe, expect, it } from 'vitest'
import { tuplesOf } from '../src/conformance/tuples.js'

/** A list that counts the values read from it. */
const counted = <A>(values: ReadonlyArray<A>, reads: { count: number }): ReadonlyArray<A> =>
  new Proxy(values, {
    get: (target, key, receiver) => {
      if (typeof key === 'string' && /^\d+$/.test(key)) reads.count += 1
      return Reflect.get(target, key, receiver)
    },
  })

const nine = [-2, -1, 0, 1, 2, 7, 0.5, -0.5, 1e6]

describe('tuplesOf', () => {
  it('reads only the values of the tuples it chooses, however many there are', () => {
    const reads = { count: 0 }
    const lists = Array.from({ length: 6 }, () => counted(nine, reads))
    // 9^6 = 531,441 tuples; one is chosen, one value from each list.
    expect(tuplesOf(lists, 1, 0)).toHaveLength(1)
    expect(reads.count).toBe(6)
    reads.count = 0
    expect(tuplesOf(lists, 300, 0)).toHaveLength(300)
    expect(reads.count).toBe(300 * 6)
  })

  it('gives every tuple, the last list varying fastest, when there are no more than asked', () => {
    expect(
      tuplesOf(
        [
          [1, 2],
          [3, 4],
        ],
        4,
        0,
      ),
    ).toEqual([
      [1, 3],
      [1, 4],
      [2, 3],
      [2, 4],
    ])
    expect(tuplesOf([[1], []], 4, 0)).toEqual([])
  })

  it('chooses distinct tuples by the seed, the same for one seed every time', () => {
    const lists = [nine, nine, nine]
    const key = (tuples: ReadonlyArray<ReadonlyArray<number>>) =>
      tuples.map(tuple => tuple.join(','))
    const chosen = key(tuplesOf(lists, 600, 3))
    expect(new Set(chosen).size).toBe(600)
    expect(key(tuplesOf(lists, 600, 3))).toEqual(chosen)
    expect(key(tuplesOf(lists, 600, 4))).not.toEqual(chosen)
  })

  it('chooses none for a limit below one', () => {
    expect(tuplesOf([nine, nine], 0, 0)).toEqual([])
    expect(tuplesOf([nine, nine], -1, 0)).toEqual([])
  })
})
