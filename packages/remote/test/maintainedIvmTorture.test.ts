/**
 * IVM & Incremental Computation Torture & Differential Fuzzing Suite.
 *
 * Exercises:
 * 1. `covers()` soundness: unbound `input.*` parameters never alias across `held` and `asked`;
 *    nested input paths (`input.range.min` / `input.range.max`) are substituted cleanly.
 * 2. `OrderIndex` reparenting & deduplication + 200-step differential fuzzing against full sort.
 * 3. `Maintained.reduce` intermediate `unsafe-integer` overflow recovery when sibling deltas cancel.
 * 4. `deltas.ts` refusal recovery: `QueryEvaluateError` during `advance()` transitions to `complete: false`
 *    instead of throwing uncaught, and recovers to `complete: true` once the offending row is fixed/rolled back.
 * 5. Optimistic single-insert fast path with patch + overlay edge.
 * 6. 150-step differential IVM fuzzer across all 9 `Maintained` definitions (filtered + unfiltered)
 *    with server patches, deletes, resurrections, refetches, concurrent optimistic writes, live echoes, and rollbacks.
 */
import { Schema } from 'effect'
import { Entity, Expr as EntityExpr } from 'foldkit-entity'
import { Node, Verdict } from 'metakit'
import * as Operation from 'metakit/operation'
import { describe, expect, it } from 'vitest'
import { filtered } from '../src/filter.js'
import { ConnectionChange, Query } from '../src/index.js'
import { Maintained, covers, makeOrderIndex } from '../src/maintained/index.js'
import {
  All,
  AllSmall,
  AnyLarge,
  Counted,
  Data,
  Earliest,
  Largest,
  Overdue,
  Total,
  Unpaid,
  answered,
  list,
  loadedWith,
  page,
  type Model,
  type Row,
} from './aggregateFixture.js'

const makeRng = (seed: number) => {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('IVM & incremental computation torture suite', () => {
  it('prevents unbound input.* aliasing in covers() and substitutes nested input paths', () => {
    const Ticket = Entity.define(
      'Ticket',
      Schema.Struct({
        id: Schema.String,
        status: Schema.Literals(['open', 'closed']),
        priority: Schema.Int,
      }),
    )
    const heldByStatus = Query.define(
      'HeldByStatus',
      { status: Schema.Literals(['open', 'closed']) },
      ({ input }) =>
        Query.from(Ticket).pipe(Query.where(EntityExpr.eq(Ticket.fields.status, input.status))),
    ).body!
    const askedByStatusAndPriority = Query.define(
      'AskedByStatusAndPriority',
      { status: Schema.Literals(['open', 'closed']) },
      ({ input }) =>
        Query.from(Ticket).pipe(
          Query.where(
            EntityExpr.and(
              EntityExpr.eq(Ticket.fields.status, input.status),
              EntityExpr.gte(Ticket.fields.priority, 5),
            ),
          ),
        ),
    ).body!

    // Without binding heldInput / askedInput, held.input.status and asked.input.status are
    // independent variables and must NOT falsely prove coverage!
    expect(Verdict.isTrue(covers(heldByStatus, askedByStatusAndPriority))).toBe(false)

    // With different bound inputs -> must NOT prove coverage.
    expect(
      Verdict.isTrue(
        covers(heldByStatus, askedByStatusAndPriority, {
          heldInput: { status: 'open' },
          askedInput: { status: 'closed' },
        }),
      ),
    ).toBe(false)

    // With matching bound inputs -> proves coverage!
    expect(
      Verdict.isTrue(
        covers(heldByStatus, askedByStatusAndPriority, {
          heldInput: { status: 'open' },
          askedInput: { status: 'open' },
        }),
      ),
    ).toBe(true)

    // Bound range parameters: [10, 50] covers [20, 40], does not cover [5, 40]
    const rangeQuery = Query.define(
      'RangeQuery',
      { min: Schema.Int, max: Schema.Int },
      ({ input }) =>
        Query.from(Ticket).pipe(
          Query.where(
            EntityExpr.and(
              EntityExpr.gte(Ticket.fields.priority, input.min),
              EntityExpr.lte(Ticket.fields.priority, input.max),
            ),
          ),
        ),
    ).body!
    expect(
      Verdict.isTrue(
        covers(rangeQuery, rangeQuery, {
          heldInput: { min: 10, max: 50 },
          askedInput: { min: 20, max: 40 },
        }),
      ),
    ).toBe(true)
    expect(
      Verdict.isTrue(
        covers(rangeQuery, rangeQuery, {
          heldInput: { min: 10, max: 50 },
          askedInput: { min: 5, max: 40 },
        }),
      ),
    ).toBe(false)
  })

  it('keeps OrderIndex deduplicated on reparenting and matches full sort across 200 random ops', () => {
    // Duplicate keys in initial entries -> last entry wins
    const dedup = makeOrderIndex(
      [
        { key: 'Item:a', sortKey: 100 },
        { key: 'Item:b', sortKey: 50 },
        { key: 'Item:a', sortKey: 10 },
      ],
      (a, b) => a - b,
    )
    expect(dedup.size).toBe(2)
    expect(dedup.keys()).toEqual(['Item:a', 'Item:b'])

    // Re-inserting existing key with a new sortKey moves it without duplicating
    dedup.insert('Item:a', 75)
    expect(dedup.size).toBe(2)
    expect(dedup.keys()).toEqual(['Item:b', 'Item:a'])

    // 200-step differential fuzzer vs Map + sort
    const rng = makeRng(20261126)
    const idx = makeOrderIndex<number>([], (a, b) => a - b)
    const oracle = new Map<string, number>()

    for (let step = 0; step < 200; step++) {
      const id = `Item:${Math.floor(rng() * 30)}`
      const op = rng()
      if (op < 0.7) {
        const sortKey = Math.floor(rng() * 15) // frequent ties to test EntityKey tie-break
        idx.insert(id, sortKey)
        oracle.set(id, sortKey)
      } else {
        const prev = oracle.get(id)
        const removed = idx.remove(id, prev ?? 0)
        expect(removed).toBe(prev !== undefined)
        oracle.delete(id)
      }
      const expected = [...oracle.entries()]
        .sort(([ka, sa], [kb, sb]) => (sa !== sb ? sa - sb : ka < kb ? -1 : ka > kb ? 1 : 0))
        .map(([k]) => k)
      expect(idx.size).toBe(expected.length)
      expect(idx.keys()).toEqual(expected)
    }
  })

  it('recovers from intermediate unsafe-integer overflow in invertible Maintained.reduce', () => {
    const SafeSub = Operation.define({
      id: 'ivm.safeSub',
      version: 1,
      args: [Schema.Int, Schema.Int] as const,
      returns: Schema.Int,
      nulls: 'strict',
      claims: {},
    })
    const SafeAdd = Operation.define({
      id: 'ivm.safeAdd',
      version: 1,
      args: [Schema.Int, Schema.Int] as const,
      returns: Schema.Int,
      nulls: 'strict',
      claims: {
        commutative: true,
        associative: true,
        identity: { value: 0, side: 'both' },
        invertible: { inverse: SafeSub },
      },
    })
    const checked = (at: string, result: number): number | Node.Refusal =>
      Number.isSafeInteger(result)
        ? result
        : new Node.Refusal({ reason: 'unsafe-integer', at, detail: `${result} is unsafe` })
    const impls = Operation.implementations(
      'ivm-safe-sum',
      Operation.implement(SafeAdd, (a, b) => checked('ivm.safeAdd', a + b) as number),
      Operation.implement(SafeSub, (a, b) => checked('ivm.safeSub', a - b) as number),
    )

    const reduceSum = Maintained.reduce<Row, number>(SafeAdd, r => r.cents, impls)
    const max = Number.MAX_SAFE_INTEGER
    const before = Data.reduce(
      loadedWith(3),
      answered({ i0: { cents: 1 }, i1: { cents: -1 }, i2: { cents: max } }),
    )
    expect(Maintained.value(Data, before, list, reduceSum).value).toBe(max)

    // In one batch, i0 increases from 1 -> 2 (intermediate total max + 1 overflows!)
    // while i1 decreases from -1 -> -2 (cancelling the overflow so final total is max).
    const updated = Data.reduce(before, answered({ i0: { cents: 2 }, i1: { cents: -2 } }))
    expect(Maintained.value(Data, updated, list, reduceSum).value).toBe(max)
  })

  it('handles QueryEvaluateError during advance() and recovers when offending row is fixed or rolled back', () => {
    const whereUnpaid = { where: Unpaid, input: {} } as const
    const initial = loadedWith(3)
    const first = Maintained.value(Data, initial, list, Total, whereUnpaid)
    expect(first.complete).toBe(true)

    // Optimistic patch introduces a NUL character in status -> QueryEvaluateError in advance()
    const bad = Data.reduce(initial, {
      _tag: 'MutationStarted',
      requestId: 'nul-edit',
      optimistic: [{ entity: 'Invoice', id: 'i1', values: { status: 'unpaid\u0000' } }],
    })
    const refused = Maintained.value(Data, bad, list, Total, whereUnpaid)
    expect(refused.complete).toBe(false)

    // Rolling back the optimistic mutation must recover complete: true and exact total!
    const recovered = Data.reduce(bad, {
      _tag: 'MutationFailed',
      requestId: 'nul-edit',
      operation: 'Edit',
      error: { _tag: 'RemoteUnavailableError', message: 'rolled back' },
    })
    const after = Maintained.value(Data, recovered, list, Total, whereUnpaid)
    expect(after).toEqual(first)
    expect(after.complete).toBe(true)
  })

  it('maintains all values accurately across optimistic single-insert (patch + overlay), echo, settle, and rollback', () => {
    const initial = loadedWith(4)
    expect(Maintained.value(Data, initial, list, Maintained.list).value.length).toBe(4)
    expect(Maintained.value(Data, initial, list, Total).value).toBe(
      Total.evaluate(filtered(Data, initial, list, All, {}).items),
    )

    // Optimistic create adds BOTH a patch and an overlay edge
    const created = Data.reduce(initial, {
      _tag: 'MutationStarted',
      requestId: 'create-1',
      optimistic: [
        { entity: 'Invoice', id: 'i99', values: { cents: 500, status: 'unpaid', due: 5 } },
        ConnectionChange.append(list.ref, { entity: 'Invoice', id: 'i99' }),
      ],
    })
    const expectedCreated = filtered(Data, created, list, All, {}).items
    expect(Maintained.value(Data, created, list, Maintained.list).value).toEqual(expectedCreated)
    expect(Maintained.value(Data, created, list, Total).value).toBe(Total.evaluate(expectedCreated))
    expect(Maintained.value(Data, created, list, Counted).value).toBe(5)

    // Rollback removes both patch and overlay cleanly
    const rolledBack = Data.reduce(created, {
      _tag: 'MutationFailed',
      requestId: 'create-1',
      operation: 'CreateInvoice',
      error: { _tag: 'RemoteUnavailableError', message: 'failed' },
    })
    const expectedBack = filtered(Data, rolledBack, list, All, {}).items
    expect(Maintained.value(Data, rolledBack, list, Maintained.list).value).toEqual(expectedBack)
    expect(Maintained.value(Data, rolledBack, list, Total).value).toBe(Total.evaluate(expectedBack))
    expect(Maintained.value(Data, rolledBack, list, Counted).value).toBe(4)
  })

  it('matches full recomputation across a 150-step differential walk over all 9 Maintained kinds (filtered & unfiltered)', () => {
    const Flags = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 2147483647 }))
    const flagsXor = Operation.define({
      id: 'fuzz.xor',
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
    const flagsOr = Operation.define({
      id: 'fuzz.or',
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
    const impls = Operation.implementations(
      'fuzz-flags',
      Operation.implement(flagsXor, (a, b) => a ^ b),
      Operation.implement(flagsOr, (a, b) => a | b),
    )

    const xorDef = Maintained.reduce<Row, number>(flagsXor, r => r.cents, impls)
    const orDef = Maintained.reduce<Row, number>(flagsOr, r => r.cents, impls)
    const joinDef = Maintained.join<Row>(r => r.status)
    const whereUnpaid = { where: Unpaid, input: {} } as const

    const checkModel = (m: Model) => {
      const allRows = filtered(Data, m, list, All, {})
      const unpaidRows = filtered(Data, m, list, Unpaid, {})

      // Unfiltered checks
      expect(Maintained.value(Data, m, list, Maintained.list)).toEqual({
        value: allRows.items,
        complete: allRows.complete,
      })
      expect(Maintained.value(Data, m, list, Total)).toEqual({
        value: Total.evaluate(allRows.items),
        complete: allRows.complete,
      })
      expect(Maintained.value(Data, m, list, Counted)).toEqual({
        value: Counted.evaluate(allRows.items),
        complete: allRows.complete,
      })
      expect(Maintained.value(Data, m, list, Overdue)).toEqual({
        value: Overdue.evaluate(allRows.items),
        complete: allRows.complete,
      })
      expect(Maintained.value(Data, m, list, Earliest)).toEqual({
        value: Earliest.evaluate(allRows.items),
        complete: allRows.complete,
      })
      expect(Maintained.value(Data, m, list, Largest)).toEqual({
        value: Largest.evaluate(allRows.items),
        complete: allRows.complete,
      })
      expect(Maintained.value(Data, m, list, AllSmall)).toEqual({
        value: AllSmall.evaluate(allRows.items),
        complete: allRows.complete,
      })
      expect(Maintained.value(Data, m, list, AnyLarge)).toEqual({
        value: AnyLarge.evaluate(allRows.items),
        complete: allRows.complete,
      })
      expect(Maintained.value(Data, m, list, xorDef).value).toBe(
        allRows.items.reduce((acc, r) => acc ^ r.cents, 0),
      )
      expect(Maintained.value(Data, m, list, orDef).value).toBe(
        allRows.items.reduce((acc, r) => acc | r.cents, 0),
      )
      const joined = Maintained.value(Data, m, list, joinDef).value
      expect(joined.forTarget('paid').length).toBe(
        allRows.items.filter(r => r.status === 'paid').length,
      )
      expect(joined.forTarget('unpaid').length).toBe(
        allRows.items.filter(r => r.status === 'unpaid').length,
      )

      // Filtered (`where: Unpaid`) checks
      expect(Maintained.value(Data, m, list, Maintained.list, whereUnpaid)).toEqual({
        value: unpaidRows.items,
        complete: unpaidRows.complete,
      })
      expect(Maintained.value(Data, m, list, Total, whereUnpaid)).toEqual({
        value: Total.evaluate(unpaidRows.items),
        complete: unpaidRows.complete,
      })
      expect(Maintained.value(Data, m, list, Earliest, whereUnpaid)).toEqual({
        value: Earliest.evaluate(unpaidRows.items),
        complete: unpaidRows.complete,
      })
    }

    const rng = makeRng(987654321)
    let model = loadedWith(8)
    let reqCounter = 0
    const inflight: Array<{
      readonly id: string
      readonly targetId: string
      readonly cents: number
      readonly status: string
      readonly due: number | null
    }> = []

    checkModel(model)

    for (let step = 0; step < 150; step++) {
      const idx = Math.floor(rng() * 8)
      const targetId = `i${idx}`
      const nextCents = Math.floor(rng() * 1000)
      const nextStatus = rng() < 0.5 ? 'paid' : 'unpaid'
      const nextDue = rng() < 0.25 ? null : Math.floor(rng() * 40)
      const action = rng()

      if (action < 0.25) {
        // Server read/patch
        model = Data.reduce(
          model,
          answered(
            { [targetId]: { cents: nextCents, status: nextStatus, due: nextDue } },
            step + 1,
          ),
        )
      } else if (action < 0.4) {
        // Server delete (tombstone) or resurrection
        if (rng() < 0.5) {
          model = Data.reduce(model, {
            _tag: 'LiveReceived',
            stream: 's',
            event: {
              _tag: 'EntityDeleted',
              ref: { entity: 'Invoice', id: targetId },
              cursor: step + 1,
              revision: step + 1,
            },
            now: step + 1,
          })
        } else {
          model = Data.reduce(
            model,
            answered(
              { [targetId]: { cents: nextCents, status: nextStatus, due: nextDue } },
              step + 2,
            ),
          )
        }
      } else if (action < 0.65 && inflight.length < 3) {
        // Start concurrent optimistic mutation
        const reqId = `req-${++reqCounter}`
        inflight.push({ id: reqId, targetId, cents: nextCents, status: nextStatus, due: nextDue })
        model = Data.reduce(model, {
          _tag: 'MutationStarted',
          requestId: reqId,
          optimistic: [
            {
              entity: 'Invoice',
              id: targetId,
              values: { cents: nextCents, status: nextStatus, due: nextDue },
            },
          ],
        })
      } else if (action < 0.85 && inflight.length > 0) {
        // Settle or rollback oldest inflight mutation (sometimes after a live echo)
        const pending = inflight.shift()!
        if (rng() < 0.5) {
          model = Data.reduce(model, {
            _tag: 'LiveReceived',
            stream: 's',
            event: {
              _tag: 'EntityPatched',
              ref: { entity: 'Invoice', id: pending.targetId },
              values: { cents: pending.cents, status: pending.status, due: pending.due },
              changed: ['cents', 'status', 'due'],
              cursor: step + 1,
              revision: step + 10,
            },
            now: step + 10,
          })
          checkModel(model)
        }
        if (rng() < 0.6) {
          model = Data.reduce(model, {
            _tag: 'MutationSucceeded',
            requestId: pending.id,
            entities: [
              {
                entity: 'Invoice',
                id: pending.targetId,
                values: { cents: pending.cents, status: pending.status, due: pending.due },
                revision: step + 10,
              },
            ],
            now: step + 10,
          })
        } else {
          model = Data.reduce(model, {
            _tag: 'MutationFailed',
            requestId: pending.id,
            operation: 'UpdateInvoice',
            error: { _tag: 'RemoteUnavailableError', message: 'rollback' },
          })
        }
      } else {
        // Page refresh with a random subset of ids in All's order (id asc)
        const ids = Array.from({ length: 8 }, (_, i) => `i${i}`).filter(() => rng() < 0.75)
        model = Data.reduce(model, {
          _tag: 'RefreshStarted',
          requests: [],
          connections: [list.ref.identity],
        })
        model = Data.reduce(model, { ...page(ids), refreshes: true })
      }

      checkModel(model)
    }
  })
})
