/**
 * What one changed row costs a kept aggregate, at 1,000 rows and at 100,000
 * (#580). Counted in rows handed to the aggregate, which is what grows with
 * the list when a value is worked out from every row: a write, a row leaving
 * and entering the filter, and a pending write with its rollback each hand it
 * one row whatever the list's length. The time each read takes is printed
 * beside, by kind of change, for the record and not asserted.
 */
import { describe, expect, it } from 'vitest'
import type { RemoteMessage } from '../src/index.js'
import { aggregated } from '../src/aggregate.js'
import { Data, Total, Unpaid, answered, counting, list, loadedWith } from './aggregateFixture.js'

const CHANGES = 20

/** One round of changes to an unpaid row, by name. */
const round = (id: string, change: number): ReadonlyArray<readonly [string, RemoteMessage]> => [
  ['a write', answered({ [id]: { cents: change } })],
  ['leaving the filter', answered({ [id]: { status: 'paid' } })],
  ['entering it', answered({ [id]: { status: 'unpaid' } })],
  [
    'a pending write',
    {
      _tag: 'MutationStarted',
      requestId: `bump${change}`,
      optimistic: [{ entity: 'Invoice', id, values: { cents: 999 } }],
    },
  ],
  [
    'its rollback',
    {
      _tag: 'MutationFailed',
      requestId: `bump${change}`,
      error: { _tag: 'RemoteMutationError', message: 'down' },
      operation: `op-bump${change}`,
    },
  ],
]

const perChange = (count: number) => {
  const { aggregate, calls } = counting(Total)
  const where = { where: Unpaid, input: {} }
  let model = loadedWith(count)
  aggregated(Data, model, list, aggregate, where)
  const handed = () => calls.evaluated + calls.inserted + calls.deleted + calls.updated
  const loaded = handed()
  const milliseconds = new Map<string, number>()
  for (let change = 0; change < CHANGES; change++) {
    // `loadedWith` leaves every row whose index is not a multiple of 3 unpaid.
    for (const [kind, message] of round(`i${change * 3 + 1}`, change)) {
      model = Data.reduce(model, message)
      const started = performance.now()
      aggregated(Data, model, list, aggregate, where)
      milliseconds.set(
        kind,
        (milliseconds.get(kind) ?? 0) + (performance.now() - started) / CHANGES,
      )
    }
  }
  return { rows: handed() - loaded, milliseconds }
}

describe('What the list and the query say', () => {
  it('is worked out once for the objects a view passes, not on every call', () => {
    // `Input` is read to encode the query's input into the kept value's name.
    let encoded = 0
    const Counted = Object.defineProperty({ ...Unpaid }, 'Input', {
      get: () => {
        encoded += 1
        return Unpaid.Input
      },
    })
    const where = { where: Counted, input: {} }
    const model = loadedWith(10)
    const first = aggregated(Data, model, list, Total, where)
    const once = encoded
    expect(once).toBeGreaterThan(0)
    expect(aggregated(Data, model, list, Total, where)).toBe(first)
    expect(aggregated(Data, { ...model, viewer: 'u1' }, list, Total, where)).toBe(first)
    expect(encoded).toBe(once)
    // Another object saying the same is worked out, and names the same kept value.
    expect(aggregated(Data, model, list, Total, { where: Counted, input: {} })).toBe(first)
    expect(encoded).toBeGreaterThan(once)
  })
})

describe('One changed row', () => {
  it('hands the aggregate the same rows at 1,000 and at 100,000', () => {
    const small = perChange(1_000)
    const large = perChange(100_000)
    for (const [kind, ms] of small.milliseconds)
      console.info(
        `${kind}: ${ms.toFixed(3)} ms at 1,000, ${large.milliseconds.get(kind)!.toFixed(3)} ms at 100,000`,
      )
    // Each round hands it one row per change: an update, a delete, an insert,
    // and an update each for the pending write and its rollback.
    expect(small.rows).toBe(CHANGES * 5)
    expect(large.rows).toBe(small.rows)
  }, 300_000)
})
