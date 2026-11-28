import { Schema } from 'effect'
import * as Operation from '@doeixd/metakit/operation'
import { describe, expect, it } from 'vitest'
import { filtered } from '../src/filter.js'
import { Classification, Maintained, classify, rescanReport } from '../src/maintained/index.js'
import {
  All,
  Data,
  Total,
  answered,
  list,
  loadedWith,
  type Model,
  type Row,
} from './aggregateFixture.js'

const Flags = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 2147483647 }))

const flagsOr = Operation.define({
  id: 'flags.or',
  version: 1,
  args: [Flags, Flags] as const,
  returns: Flags,
  nulls: 'strict',
  claims: {
    commutative: true,
    associative: true,
    idempotent: true,
    identity: { value: 0, side: 'both' },
  },
})

const flagsXor = Operation.define({
  id: 'flags.xor',
  version: 1,
  args: [Flags, Flags] as const,
  returns: Flags,
  nulls: 'strict',
  claims: {
    commutative: true,
    associative: true,
    identity: { value: 0, side: 'both' },
    invertible: { inverse: 'self' },
  },
})

const flagsAndNot = Operation.define({
  id: 'flags.andNot',
  version: 1,
  args: [Flags, Flags] as const,
  returns: Flags,
  nulls: 'strict',
  claims: {},
})

const impls = Operation.implementations(
  'test-flags',
  Operation.implement(flagsOr, (a, b) => a | b),
  Operation.implement(flagsXor, (a, b) => a ^ b),
  Operation.implement(flagsAndNot, (a, b) => a & ~b),
)

// Seeded PRNG (mulberry32) for deterministic differential walks
const makeRng = (seed: number) => {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('Maintained reduce folds, ReverseIndex joins, and differentials (Phase 4 Bouts 4.20–4.21, 4.23)', () => {
  it('refuses non-commutative/non-monoid operations in Maintained.reduce at definition time', () => {
    expect(() => Maintained.reduce<Row, number>(flagsAndNot, row => row.cents, impls)).toThrow(
      /does not claim commutative and associative with an identity/,
    )
  })

  it('maintains reduce(flagsOr), reduce(flagsXor), and join(status) matching full recomputation across a seeded differential walk', () => {
    const orDef = Maintained.reduce<Row, number>(flagsOr, row => row.cents, impls)
    const xorDef = Maintained.reduce<Row, number>(flagsXor, row => row.cents, impls)
    const joinDef = Maintained.join<Row>(row => row.status)

    let model: Model = loadedWith(6)
    const rng = makeRng(20261125)
    let pendingId = 0

    const checkAll = (m: Model) => {
      const rows = filtered(Data, m, list, All, {}).items
      const expectedOr = rows.reduce((acc, r) => acc | r.cents, 0)
      const expectedXor = rows.reduce((acc, r) => acc ^ r.cents, 0)
      const expectedPaid = rows.filter(r => r.status === 'paid')
      const expectedUnpaid = rows.filter(r => r.status === 'unpaid')

      expect(Maintained.value(Data, m, list, orDef).value).toBe(expectedOr)
      expect(Maintained.value(Data, m, list, xorDef).value).toBe(expectedXor)
      const joined = Maintained.value(Data, m, list, joinDef).value
      expect(joined.forTarget('paid').length).toBe(expectedPaid.length)
      expect(joined.forTarget('unpaid').length).toBe(expectedUnpaid.length)
      expect(
        joined
          .forTarget('paid')
          .map(r => r.cents)
          .sort((a, b) => a - b),
      ).toEqual(expectedPaid.map(r => r.cents).sort((a, b) => a - b))
    }

    checkAll(model)

    for (let step = 0; step < 50; step++) {
      const idx = Math.floor(rng() * 6)
      const id = `i${idx}`
      const nextCents = Math.floor(rng() * 128)
      const nextStatus = rng() < 0.5 ? 'paid' : 'unpaid'
      const action = rng()

      if (action < 0.4) {
        // Server patch
        model = Data.reduce(
          model,
          answered({ [id]: { cents: nextCents, status: nextStatus } }, step + 1),
        )
      } else if (action < 0.7) {
        // Optimistic write then settle
        const req = `req-${++pendingId}`
        model = Data.reduce(model, {
          _tag: 'MutationStarted',
          requestId: req,
          optimistic: [{ entity: 'Invoice', id, values: { cents: nextCents, status: nextStatus } }],
        })
        checkAll(model)
        model = Data.reduce(model, {
          _tag: 'MutationSucceeded',
          requestId: req,
          entities: [{ entity: 'Invoice', id, values: { cents: nextCents, status: nextStatus } }],
          now: step + 100,
        })
      } else {
        // Optimistic write then rollback
        const req = `req-${++pendingId}`
        model = Data.reduce(model, {
          _tag: 'MutationStarted',
          requestId: req,
          optimistic: [{ entity: 'Invoice', id, values: { cents: nextCents, status: nextStatus } }],
        })
        checkAll(model)
        model = Data.reduce(model, {
          _tag: 'MutationFailed',
          requestId: req,
          operation: 'UpdateInvoice',
          error: { _tag: 'RemoteUnavailableError', message: 'rolled back' },
        })
      }
      checkAll(model)
    }
  })

  it('classifies reduce and join definitions and reports every rescanning proof value', () => {
    const orDef = Maintained.reduce<Row, number>(flagsOr, row => row.cents, impls)
    const xorDef = Maintained.reduce<Row, number>(flagsXor, row => row.cents, impls)
    const joinDef = Maintained.join<Row>(row => row.status)

    expect(classify(xorDef, { on: 'delete' })).toEqual(
      Classification.Update({ by: 'fold-invertible' }),
    )
    expect(classify(orDef, { on: 'insert' })).toEqual(
      Classification.Update({ by: 'fold-insert-only' }),
    )
    expect(classify(orDef, { on: 'delete' })).toEqual(
      Classification.Rescan({ reason: 'fold-not-invertible-on-delete' }),
    )
    expect(classify(joinDef, { on: 'delete' })).toEqual(
      Classification.Update({ by: 'reverse-index' }),
    )

    const report = rescanReport([
      { name: 'invoiceTotal', definition: Total },
      { name: 'flagsXorTotal', definition: xorDef },
      { name: 'flagsOrTotal', definition: orDef },
      { name: 'invoicesByStatus', definition: joinDef },
      { name: 'invoiceList', definition: Maintained.list },
    ])
    expect(report).toEqual([
      {
        name: 'flagsOrTotal',
        reason: 'fold-not-invertible-on-delete',
        message:
          '[foldkit-remote] maintained "flagsOrTotal" rescans on delete: fold has no inverse.',
      },
    ])
  })

  it('updates invertible reduce(flagsXor) in O(1) without rescanning all rows on replace', () => {
    let xorPicks = 0
    let orPicks = 0
    const xorDef = Maintained.reduce<Row, number>(
      flagsXor,
      row => {
        xorPicks++
        return row.cents
      },
      impls,
    )
    const orDef = Maintained.reduce<Row, number>(
      flagsOr,
      row => {
        orPicks++
        return row.cents
      },
      impls,
    )
    const initial = loadedWith(20)
    Maintained.value(Data, initial, list, xorDef)
    Maintained.value(Data, initial, list, orDef)
    xorPicks = 0
    orPicks = 0

    const next = Data.reduce(initial, answered({ i0: { cents: 99 } }, 1))
    Maintained.value(Data, next, list, xorDef)
    Maintained.value(Data, next, list, orDef)

    // Invertible xor reads only the changed row (before + after = 2); non-invertible or rescans all 20
    expect(xorPicks).toBe(2)
    expect(orPicks).toBeGreaterThanOrEqual(20)
  })
})
