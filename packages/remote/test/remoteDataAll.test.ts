/**
 * `RemoteData.all`: several reads as one. The first state any entry is in
 * decides, in the order Failed, NotFound, Initial, Loading; with every entry
 * holding a value, the result is Refreshing if any is, else Ready. A failure
 * keeps the values every entry held, so the view still draws them stale.
 */
import { describe, expect, it } from 'vitest'
import { RemoteData, type RemoteError } from '../src/index.js'

const bad: RemoteError = { _tag: 'Boom', message: 'bad' }
const worse: RemoteError = { _tag: 'Crash', message: 'worse' }

type Pair = { readonly a: number; readonly b: number }
type Case = RemoteData<number>
type Name = 'Initial' | 'Loading' | 'Ready' | 'Refreshing' | 'Failed' | 'FailedHeld' | 'NotFound'

/** `a` is 1 and `b` is 2, so a value that lands under the wrong key is seen. */
const cases = (value: number): Record<Name, Case> => ({
  Initial: { _tag: 'Initial' },
  Loading: { _tag: 'Loading' },
  Ready: { _tag: 'Ready', value },
  Refreshing: { _tag: 'Refreshing', value },
  Failed: { _tag: 'Failed', error: bad },
  FailedHeld: { _tag: 'Failed', error: bad, previous: value },
  NotFound: { _tag: 'NotFound' },
})

const failed: RemoteData<Pair> = { _tag: 'Failed', error: bad }
const failedHeld: RemoteData<Pair> = { _tag: 'Failed', error: bad, previous: { a: 1, b: 2 } }
const initial: RemoteData<Pair> = { _tag: 'Initial' }
const loading: RemoteData<Pair> = { _tag: 'Loading' }
const notFound: RemoteData<Pair> = { _tag: 'NotFound' }
const ready: RemoteData<Pair> = { _tag: 'Ready', value: { a: 1, b: 2 } }
const refreshing: RemoteData<Pair> = { _tag: 'Refreshing', value: { a: 1, b: 2 } }

/** One row per unordered pair of states; each is asserted in both key orders. */
const pairs: ReadonlyArray<readonly [Name, Name, RemoteData<Pair>]> = [
  ['Initial', 'Initial', initial],
  ['Initial', 'Loading', initial],
  ['Initial', 'Ready', initial],
  ['Initial', 'Refreshing', initial],
  ['Initial', 'Failed', failed],
  ['Initial', 'FailedHeld', failed],
  ['Initial', 'NotFound', notFound],
  ['Loading', 'Loading', loading],
  ['Loading', 'Ready', loading],
  ['Loading', 'Refreshing', loading],
  ['Loading', 'Failed', failed],
  ['Loading', 'FailedHeld', failed],
  ['Loading', 'NotFound', notFound],
  ['Ready', 'Ready', ready],
  ['Ready', 'Refreshing', refreshing],
  ['Ready', 'Failed', failed],
  ['Ready', 'FailedHeld', failedHeld],
  ['Ready', 'NotFound', notFound],
  ['Refreshing', 'Refreshing', refreshing],
  ['Refreshing', 'Failed', failed],
  ['Refreshing', 'FailedHeld', failedHeld],
  ['Refreshing', 'NotFound', notFound],
  ['Failed', 'Failed', failed],
  ['Failed', 'FailedHeld', failed],
  ['Failed', 'NotFound', failed],
  ['FailedHeld', 'FailedHeld', failedHeld],
  ['FailedHeld', 'NotFound', failed],
  ['NotFound', 'NotFound', notFound],
]

/** The same pair asked in the other key order holds each value under the other key. */
const swapped = (expected: RemoteData<Pair>): RemoteData<Pair> =>
  RemoteData.map(expected, value => ({ a: value.b, b: value.a }))

describe('RemoteData.all, a pair of reads', () => {
  it.each(pairs)('%s with %s is decided as one read', (first, second, expected) => {
    expect(RemoteData.all({ a: cases(1)[first], b: cases(2)[second] })).toEqual(expected)
    expect(RemoteData.all({ a: cases(2)[second], b: cases(1)[first] })).toEqual(swapped(expected))
  })

  it('names every pair of states', () => {
    const names = Object.keys(cases(1))
    const key = (a: string, b: string) => [a, b].sort().join('+')
    expect(new Set(names.flatMap(a => names.map(b => key(a, b))))).toEqual(
      new Set(pairs.map(([a, b]) => key(a, b))),
    )
  })
})

describe('RemoteData.all, more than two reads', () => {
  it('lets a Failed beat a NotFound beat an Initial beat a Loading, wherever each stands', () => {
    const states = {
      loading: cases(1).Loading,
      initial: cases(1).Initial,
      missing: cases(1).NotFound,
      broken: cases(1).Failed,
      fine: cases(1).Ready,
    }
    expect(RemoteData.all(states)).toEqual({ _tag: 'Failed', error: bad })
    const { broken: _broken, ...withoutFailure } = states
    expect(RemoteData.all(withoutFailure)).toEqual({ _tag: 'NotFound' })
    const { missing: _missing, ...withoutMissing } = withoutFailure
    expect(RemoteData.all(withoutMissing)).toEqual({ _tag: 'Initial' })
    const { initial: _initial, ...withoutInitial } = withoutMissing
    expect(RemoteData.all(withoutInitial)).toEqual({ _tag: 'Loading' })
  })

  it('answers the first failure in key order, and keeps the values all hold', () => {
    const data = RemoteData.all({
      one: { _tag: 'Failed', error: bad, previous: 1 } as RemoteData<number>,
      two: { _tag: 'Failed', error: worse, previous: 2 } as RemoteData<number>,
      three: { _tag: 'Refreshing', value: 3 } as RemoteData<number>,
    })
    expect(data).toEqual({ _tag: 'Failed', error: bad, previous: { one: 1, two: 2, three: 3 } })
  })

  it('answers Ready of the struct when every entry is Ready, and of nothing for no entries', () => {
    expect(
      RemoteData.all({
        n: { _tag: 'Ready', value: 1 } as RemoteData<number>,
        s: { _tag: 'Ready', value: 'x' } as RemoteData<string>,
      }),
    ).toEqual({ _tag: 'Ready', value: { n: 1, s: 'x' } })
    expect(RemoteData.all({})).toEqual({ _tag: 'Ready', value: {} })
  })

  it('is Refreshing while any entry is, with every value held', () => {
    expect(
      RemoteData.all({
        a: { _tag: 'Ready', value: 1 } as RemoteData<number>,
        b: { _tag: 'Refreshing', value: 2 } as RemoteData<number>,
        c: { _tag: 'Ready', value: 3 } as RemoteData<number>,
      }),
    ).toEqual({ _tag: 'Refreshing', value: { a: 1, b: 2, c: 3 } })
  })

  it('keeps a key named like an Object member as an own key', () => {
    const data = RemoteData.all({
      constructor: { _tag: 'Ready', value: 1 } as RemoteData<number>,
      toString: { _tag: 'Ready', value: 2 } as RemoteData<number>,
    })
    expect(data).toEqual({ _tag: 'Ready', value: { constructor: 1, toString: 2 } })
  })
})
