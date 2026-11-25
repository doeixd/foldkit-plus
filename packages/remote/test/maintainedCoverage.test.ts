import { Schema } from 'effect'
import { Entity, Expr as EntityExpr, Query } from 'foldkit-entity'
import { Verdict } from 'metakit'
import * as Aggregates from 'metakit/aggregates'
import * as Operation from 'metakit/operation'
import { describe, expect, it } from 'vitest'
import {
  Classification,
  Freshness,
  Maintained,
  classify,
  classifyOperation,
  covers,
  formatRescanLog,
  markCurrent,
  rescanReport,
  restoreAsOf,
  retainAsOf,
} from '../src/maintained/index.js'

const Item = Entity.define(
  'Item',
  Schema.Struct({
    id: Schema.String,
    price: Schema.Int,
    status: Schema.Literals(['a', 'b', 'c']),
  }),
)

const Other = Entity.define('Other', Schema.Struct({ id: Schema.String }))

describe('foldkit-remote/maintained coverage (Bout 4.14)', () => {
  it('proves held covers asked when asked.where implies held.where', () => {
    const heldAll = Query.from(Item)
    const heldCheap = Query.from(Item).pipe(Query.where(EntityExpr.lt(Item.fields.price, 20)))
    const askedVeryCheap = Query.from(Item).pipe(Query.where(EntityExpr.lt(Item.fields.price, 10)))

    expect(Verdict.isTrue(covers(heldAll, askedVeryCheap))).toBe(true)
    expect(Verdict.isTrue(covers(heldCheap, askedVeryCheap))).toBe(true)
  })

  it('does NOT claim coverage when held is narrower than asked or on another entity (negative cases)', () => {
    const heldNarrow = Query.from(Item).pipe(Query.where(EntityExpr.lt(Item.fields.price, 10)))
    const askedWider = Query.from(Item).pipe(Query.where(EntityExpr.lt(Item.fields.price, 20)))
    // price < 20 does NOT imply price < 10 -> not True (Unknown -> ask server).
    expect(Verdict.isTrue(covers(heldNarrow, askedWider))).toBe(false)

    const heldStatusA = Query.from(Item).pipe(Query.where(EntityExpr.eq(Item.fields.status, 'a')))
    const askedStatusAB = Query.from(Item).pipe(
      Query.where(
        EntityExpr.or(
          EntityExpr.eq(Item.fields.status, 'a'),
          EntityExpr.eq(Item.fields.status, 'b'),
        ),
      ),
    )
    expect(Verdict.isTrue(covers(heldStatusA, askedStatusAB))).toBe(false)

    // Different entity -> False.
    expect(Verdict.isFalse(covers(Query.from(Other), askedWider))).toBe(true)
  })
})

describe('foldkit-remote/maintained offline asOf (Bout 4.15)', () => {
  it('retains value as of revision R without cursor, restores as AsOf needing refresh, and promotes to Current', () => {
    const retained = retainAsOf(42, 7)
    expect(retained).toEqual({ value: 42, completeAsOf: 7 })

    const restored = restoreAsOf({ ...retained, cursor: 'server-cursor-should-be-dropped' })
    expect(restored.value).toBe(42)
    expect(restored.freshness).toEqual(Freshness.AsOf({ completeAsOf: 7 }))
    expect(restored.needsRefresh).toBe(true)
    expect('cursor' in restored).toBe(false)

    const current = markCurrent(45)
    expect(current.value).toBe(45)
    expect(current.freshness).toEqual(Freshness.Current())
    expect(current.needsRefresh).toBe(false)
  })
})

describe('foldkit-remote/maintained classify & rescanReport (Bout 4.22)', () => {
  it('classifies invertible folds, insert-only folds, custom operations, and builds rescanReport', () => {
    const sumDef = Aggregates.sum(Item.schema, r => r.price)
    const minDef = Aggregates.min(Item.schema, r => r.price)

    expect(classify(sumDef, { on: 'delete' })).toEqual(
      Classification.Update({ by: 'fold-invertible' }),
    )
    expect(classify(minDef, { on: 'insert' })).toEqual(
      Classification.Update({ by: 'fold-insert-only' }),
    )
    expect(classify(minDef, { on: 'delete' })).toEqual(
      Classification.Rescan({ reason: 'fold-not-invertible-on-delete' }),
    )
    expect(classify(Maintained.list)).toEqual(Classification.Update({ by: 'sorted-placement' }))

    const Mask = Schema.Int
    const flagsOr = Operation.define({
      id: 'flags.or',
      version: 1,
      args: [Mask, Mask] as const,
      returns: Mask,
      nulls: 'strict',
      claims: { commutative: true, associative: true, identity: { value: 0, side: 'both' } },
    })
    const flagsXor = Operation.define({
      id: 'flags.xor',
      version: 1,
      args: [Mask, Mask] as const,
      returns: Mask,
      nulls: 'strict',
      claims: {
        commutative: true,
        associative: true,
        identity: { value: 0, side: 'both' },
        invertible: { inverse: 'self' },
      },
    })
    expect(classifyOperation(flagsOr, { on: 'insert' })).toEqual(
      Classification.Update({ by: 'fold-insert-only' }),
    )
    expect(classifyOperation(flagsOr, { on: 'delete' })).toEqual(
      Classification.Rescan({ reason: 'fold-not-invertible-on-delete' }),
    )
    expect(classifyOperation(flagsXor, { on: 'delete' })).toEqual(
      Classification.Update({ by: 'fold-invertible' }),
    )

    const report = rescanReport([
      { name: 'total', definition: sumDef },
      { name: 'cartTotal', definition: minDef },
    ])
    expect(report).toEqual([
      {
        name: 'cartTotal',
        reason: 'fold-not-invertible-on-delete',
        message: '[foldkit-remote] maintained "cartTotal" rescans on delete: min has no inverse.',
      },
    ])
    expect(formatRescanLog('total', classify(sumDef))).toBeUndefined()
  })
})
