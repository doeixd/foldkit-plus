/**
 * A write declared over the descriptor an Entity's invariants were attached
 * after (#539): the client's pre-send check judges them all the same, since
 * they are the Entity's, not the descriptor's.
 */
import { Option, Schema } from 'effect'
import { Entity, Expr, Operators, Write } from 'foldkit-entity'
import { describe, expect, it } from 'vitest'
import { brokenByWrite } from '../src/index.js'

const ItemFields = Entity.define(
  'Item',
  Schema.Struct({ id: Schema.String, count: Schema.Number, cap: Schema.Number }),
)
// Declared through a pipe whose result is never used: every write below names `ItemFields`.
ItemFields.pipe(
  Entity.invariant<typeof ItemFields>(
    'withinCap',
    ({ after }) => Expr.lte(after.count, after.cap),
    {
      message: 'The count stays within the cap',
    },
  ),
)

describe('brokenByWrite over the bare descriptor', () => {
  it('refuses a write that breaks an invariant attached to another descriptor', () => {
    const create = Write.insert(
      Entity.input(
        ItemFields,
        Schema.Struct({ id: Schema.String, count: Schema.Number, cap: Schema.Number }),
      ),
      { id: 'id' },
    )
    const judged = (count: number) =>
      brokenByWrite(
        create,
        { id: 'i1', count, cap: 5 },
        undefined,
        { viewer: Option.none(), now: Option.none() },
        {},
        Operators.kernel,
      )
    expect(Option.map(judged(6), invariant => invariant.id)).toEqual(Option.some('withinCap'))
    expect(judged(5)).toEqual(Option.none())
  })
})
