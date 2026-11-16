/**
 * An order over text with no declared collation is refused by `evaluate` as
 * `Query.placement` refuses it, with the same reason (#569): SQLite compares
 * bytes, Postgres follows its database's locale and JavaScript compares UTF-16
 * units, so no one answer is right.
 */
import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  Collation,
  Entity,
  Expr,
  Order,
  Query,
  QueryEvaluateError,
  compareRows,
  evaluate,
  evaluateEach,
} from '../src/index.js'

const Item = Entity.define(
  'Item',
  Schema.Struct({ id: Schema.String, name: Schema.String, rank: Schema.NullOr(Schema.Number) }),
)
const Declared = Entity.define(
  'Declared',
  Schema.Struct({ id: Schema.String, name: Schema.String }),
).pipe(Entity.annotateMembers({ name: Collation.of(Collation.binary) }))

// Code point order and UTF-16's disagree on the last two: U+1F600 is two
// surrogates, which sort before U+FF5E; a locale passes over the hyphen.
const names = ['ab', 'a-c', 'é', 'f', '\u{1F600}', '～']
const rows = names.map((name, index) => ({ id: `r${index}`, name, rank: index }))

const reason = 'it orders by Item.name, text with no declared collation'

describe('evaluate over text with no declared collation', () => {
  const body = Query.from(Item).pipe(Query.orderBy(Order.asc(Item.fields.name)))

  it('is refused, with the reason placement gives', () => {
    expect(Query.placement(body, {})).toEqual({ _tag: 'NotPlaceable', reason })
    expect(() => evaluate(body, {}, rows)).toThrow(QueryEvaluateError)
    expect(() => evaluate(body, {}, rows)).toThrow(`query "Item" cannot be ordered: ${reason}`)
  })

  it('is refused for one row, as for many, and by compareRows', () => {
    expect(() => evaluate(body, {}, rows.slice(0, 1))).toThrow(reason)
    expect(() => compareRows(Query.orderFor(body, {}), rows[0]!, rows[1]!, 'Item')).toThrow(reason)
  })

  it('does not refuse evaluateEach, which judges membership and no order decides it', () => {
    const matching = Query.from(Item).pipe(
      Query.where(Expr.eq(Item.fields.rank, 4)),
      Query.orderBy(Order.asc(Item.fields.name)),
    )
    expect(evaluateEach(matching, {}, rows).matched.map(row => row.id)).toEqual(['r4'])
  })

  it('is refused whichever direction it asks', () => {
    const descending = Query.from(Item).pipe(Query.orderBy(Order.desc(Item.fields.name)))
    expect(() => evaluate(descending, {}, rows)).toThrow(reason)
  })

  it('is refused when only a later term is text with none', () => {
    const second = Query.from(Item).pipe(
      Query.orderBy(Order.asc(Item.fields.rank), Order.asc(Item.fields.name)),
    )
    expect(() => evaluate(second, {}, rows)).toThrow(reason)
  })

  it('answers by code point under a declared collation, and under the term’s own', () => {
    const own = Query.from(Item).pipe(
      Query.orderBy(Order.asc(Item.fields.name, { collation: Collation.binary })),
    )
    const byCodePoint = ['a-c', 'ab', 'f', 'é', '～', '\u{1F600}']
    expect(evaluate(own, {}, rows).map(row => row.name)).toEqual(byCodePoint)
    const declared = Query.from(Declared).pipe(Query.orderBy(Order.asc(Declared.fields.name)))
    expect(evaluate(declared, {}, rows).map(row => row.name)).toEqual(byCodePoint)
    expect(Query.placement(declared, {})._tag).toBe('Placeable')
  })

  it('is not asked of an order over numbers, or of the id every order ends on', () => {
    const byRank = Query.from(Item).pipe(Query.orderBy(Order.asc(Item.fields.rank)))
    expect(evaluate(byRank, {}, rows).map(row => row.id)).toEqual(rows.map(row => row.id))
    expect(evaluate(Query.from(Item), {}, [...rows].reverse()).map(row => row.id)).toEqual(
      rows.map(row => row.id),
    )
  })
})
