import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import type { RemoteMessage } from '../src/index.js'
import { filtered } from '../src/filter.js'
import { follow, readingOf, type RowDelta } from '../src/maintained/deltas.js'
import { Maintained } from '../src/maintained/index.js'
import {
  All,
  Data,
  Total,
  answered,
  list,
  loadedWith,
  page,
  type Model,
  type Row,
} from './aggregateFixture.js'

const recomputed = (model: Model) => {
  const rows = filtered(Data, model, list, All, {})
  return { value: Total.evaluate(rows.items), complete: rows.complete }
}

describe('Maintained values through the Remote reducer', () => {
  it.each([
    { title: 'set', values: { cents: 42 }, adds: undefined },
    { title: 'increment', values: {}, adds: { cents: 5 } },
  ])('emits one row delta when a pending $title is echoed and settled', ({ values, adds }) => {
    const model = Data.reduce(loadedWith(3), answered({ i1: { cents: 37 } }, 1))
    const first = follow(readingOf(Data, model, list, undefined), undefined, () => {})
    const shown = Data.reduce(model, {
      _tag: 'MutationStarted',
      requestId: 'edit',
      optimistic: [
        { entity: 'Invoice', id: 'i1', values, ...(adds === undefined ? {} : { adds }) },
      ],
    })
    const echo = Data.reduce(shown, {
      _tag: 'LiveReceived',
      stream: 's',
      event: {
        _tag: 'EntityPatched',
        ref: { entity: 'Invoice', id: 'i1' },
        values: { cents: 42 },
        changed: ['cents'],
        cursor: 1,
        revision: 2,
      },
      now: 2,
    })
    const saved = Data.reduce(echo, {
      _tag: 'MutationSucceeded',
      requestId: 'edit',
      entities: [{ entity: 'Invoice', id: 'i1', values: { cents: 42 }, revision: 2 }],
      now: 3,
    })
    const deltas: RowDelta<Row>[] = []
    let tracked = first.tracked
    for (const next of [shown, echo, saved]) {
      tracked = follow(readingOf(Data, next, list, undefined), tracked, delta =>
        deltas.push(delta),
      ).tracked
      expect(Maintained.value(Data, next, list, Total)).toEqual({ value: 116, complete: true })
    }
    expect(deltas).toEqual([
      {
        key: 'Invoice:i1',
        before: Option.some({ cents: 37, status: 'unpaid', due: 1 }),
        after: Option.some({ cents: 42, status: 'unpaid', due: 1 }),
        source: 'optimistic',
      },
    ])
  })

  it('matches recomputation through a broken live stream, refetch, and reconnect', () => {
    let model = loadedWith(3)
    const changes: ReadonlyArray<readonly [RemoteMessage, number]> = [
      [
        {
          _tag: 'ReadFailed',
          requests: [],
          error: { _tag: 'RemoteLiveError', message: 'dropped' },
          stream: 's',
        },
        111,
      ],
      [{ _tag: 'GapCleared', stream: 's' }, 111],
      [answered({ i1: { cents: 46 } }, 2), 120],
      [
        {
          _tag: 'LiveReceived',
          stream: 's',
          event: {
            _tag: 'EntityPatched',
            ref: { entity: 'Invoice', id: 'i1' },
            values: { cents: 51 },
            changed: ['cents'],
            cursor: 1,
            revision: 3,
          },
          now: 3,
        },
        125,
      ],
    ]
    expect(Maintained.value(Data, model, list, Total).value).toBe(111)
    for (const [message, total] of changes) {
      model = Data.reduce(model, message)
      const kept = Maintained.value(Data, model, list, Total)
      expect(kept).toEqual(recomputed(model))
      expect(kept.value).toBe(total)
    }
  })

  it('replaces a contribution across the full safe-integer range', () => {
    const max = Number.MAX_SAFE_INTEGER
    const before = Data.reduce(loadedWith(1), answered({ i0: { cents: -max } }))
    expect(Maintained.value(Data, before, list, Total).value).toBe(-max)
    const after = Data.reduce(before, answered({ i0: { cents: max } }))
    expect(Maintained.value(Data, after, list, Total)).toEqual(recomputed(after))
  })

  it('checks the sum of the final rows when the running total exceeds the safe-integer range', () => {
    const max = Number.MAX_SAFE_INTEGER
    const before = Data.reduce(
      loadedWith(3),
      answered({ i0: { cents: max }, i1: { cents: 1 }, i2: { cents: -1 } }),
    )
    expect(Maintained.value(Data, before, list, Total).value).toBe(max)
    const updated = Data.reduce(before, answered({ i1: { cents: 2 }, i2: { cents: -2 } }))
    expect(Maintained.value(Data, updated, list, Total)).toEqual(recomputed(updated))
    const overflow = Data.reduce(updated, answered({ i2: { cents: -1 } }))
    expect(() => Maintained.value(Data, overflow, list, Total)).toThrow(
      expect.objectContaining({ reason: 'unsafe-integer' }),
    )
    expect(Maintained.value(Data, updated, list, Total).value).toBe(max)
  })

  it('keeps unchanged rows by identity when a row changes and when a new page reorders them', () => {
    const model = loadedWith(3)
    const before = Maintained.value(Data, model, list, Maintained.list)
    const changed = Data.reduce(model, answered({ i1: { cents: 42 } }))
    const after = Maintained.value(Data, changed, list, Maintained.list)
    expect(after.value).toEqual(filtered(Data, changed, list, All, {}).items)
    expect(after.value[0]).toBe(before.value[0])
    expect(after.value[1]).not.toBe(before.value[1])
    expect(after.value[2]).toBe(before.value[2])
    expect(Maintained.value(Data, changed, list, Maintained.list)).toBe(after)
    const reordered = [
      { _tag: 'RefreshStarted', requests: [], connections: [list.ref.identity] },
      { ...page(['i2', 'i1', 'i0']), refreshes: true },
    ] satisfies ReadonlyArray<RemoteMessage>
    const update = Maintained.value(
      Data,
      reordered.reduce(Data.reduce, changed),
      list,
      Maintained.list,
    )
    expect(update).toEqual({
      value: [after.value[2], after.value[1], after.value[0]],
      complete: true,
    })
    expect(update.value[0]).toBe(after.value[2])
    expect(update.value[1]).toBe(after.value[1])
    expect(update.value[2]).toBe(after.value[0])
  })
})
