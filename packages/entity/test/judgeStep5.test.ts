/**
 * The judge reads metakit's evaluation of the translation (step 5 of the
 * kernel convergence note): a refusal is a failure carrying metakit's
 * `Refusal`, a row it refuses is set aside by `evaluateEach`, and stored text
 * is read as text that cannot hold a NUL.
 */
import { Option, Schema } from 'effect'
import { Verdict } from 'metakit'
import { describe, expect, it } from 'vitest'
import {
  Entity,
  Expr,
  Held,
  Judge,
  Query,
  QueryEvaluateError,
  evaluate,
  evaluateEach,
} from '../src/index.js'

const Item = Entity.define(
  'Item',
  Schema.Struct({ id: Schema.String, name: Schema.String, qty: Schema.Int }),
)
const { fields } = Item

const refusalOf = (run: () => unknown) => {
  try {
    run()
  } catch (error) {
    if (error instanceof QueryEvaluateError) return error.refusal
    throw error
  }
  return Option.none()
}

describe('A refusal', () => {
  const past = Query.from(Item).pipe(
    Query.where(Expr.gt(Expr.add(fields.qty, Expr.input('more', Schema.Int)), 0)),
  )

  it('fails evaluate, carrying what metakit refused', () => {
    const refusal = refusalOf(() =>
      evaluate(past, { more: Number.MAX_SAFE_INTEGER }, [{ id: 'a', name: 'A', qty: 2 }]),
    )
    expect(Option.map(refusal, ({ reason, at }) => [reason, at])).toEqual(
      Option.some(['unsafe-integer', 'num.add']),
    )
  })

  it('sets the row it refuses aside in evaluateEach, and still answers the others', () => {
    const judged = evaluateEach(past, { more: Number.MAX_SAFE_INTEGER - 2 }, [
      { id: 'a', name: 'A', qty: 1 },
      { id: 'b', name: 'B', qty: 5 },
    ])
    expect([judged.matched.map(row => row.id), judged.refused.map(row => row.id)]).toEqual([
      ['a'],
      ['b'],
    ])
  })
})

describe('Stored text', () => {
  const named = Expr.eq(fields.name, Expr.input('name', Schema.String))
  const nameless = Option.getOrThrow(
    Held.rows([{ entity: Item, rows: [{ id: 'a', qty: 1 }] }]).row(Item, 'a'),
  )

  it('cannot hold a NUL, so a null beside a stored field the holder lacks is null', () => {
    expect(Judge.predicate(named, nameless, { input: { name: null } })).toEqual(
      Verdict.False(Option.some('null')),
    )
  })

  it('keeps the holder its own reason for what it lacks', () => {
    expect(Judge.predicate(named, nameless, { input: { name: 'A' } })).toEqual(
      Verdict.Unknown('Item.name is not held'),
    )
  })
})
