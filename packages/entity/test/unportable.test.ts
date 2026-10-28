/**
 * What no two backends agree on is refused, whichever way it reaches a body:
 * NaN (SQLite stores it as null, Postgres orders it last and equal to itself),
 * and a refusal does not depend on where its predicate sits in `where`.
 */
import { Option, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  Entity,
  Expr,
  Held,
  Judge,
  Order,
  Query,
  evaluate,
  evaluateEach,
  truthOver,
} from '../src/index.js'

const Scored = Entity.define(
  'Scored',
  Schema.Struct({ id: Schema.String, a: Schema.String, b: Schema.String, score: Schema.Number }),
)
const from = Query.from(Scored).pipe(Query.orderBy(Order.asc(Scored.fields.id)))
const scores = [3, Number.NaN, 1, 9, 2].map((score, index) => ({
  id: `n${index + 1}`,
  a: 'x',
  b: 'y',
  score,
}))

describe('NaN', () => {
  it('refuses its row from an order, which every other row is still sorted by', () => {
    const body = Query.from(Scored).pipe(Query.orderBy(Order.asc(Scored.fields.score)))
    expect(() => evaluate(body, {}, scores)).toThrow(/NaN/)
    const judged = evaluateEach(body, {}, scores)
    expect(judged.matched.map(row => row.id)).toEqual(['n3', 'n5', 'n1', 'n4'])
    expect(judged.refused.map(row => row.id)).toEqual(['n2'])
  })

  it.each([
    { what: 'a comparison', predicate: Expr.gt(Scored.fields.score, 5), matched: ['n4'] },
    { what: 'an equality', predicate: Expr.eq(Scored.fields.score, 9), matched: ['n4'] },
    { what: 'a membership test', predicate: Expr.in(Scored.fields.score, [9]), matched: ['n4'] },
  ])('refuses a stored NaN in $what, and that row only', ({ predicate, matched }) => {
    const body = from.pipe(Query.where(predicate))
    expect(() => evaluate(body, {}, scores)).toThrow(/NaN/)
    const judged = evaluateEach(body, {}, scores)
    expect(judged.matched.map(row => row.id)).toEqual(matched)
    expect(judged.refused.map(row => row.id)).toEqual(['n2'])
  })

  it('refuses a given NaN for the run, even beside a null, as a given NUL is', () => {
    const given = Expr.input('given', Schema.Number)
    const body = from.pipe(Query.where(Expr.lt(Scored.fields.score, given)))
    expect(() => evaluateEach(body, { given: Number.NaN }, scores)).toThrow(/NaN/)
    // A stored null would answer SQL's null first; the given NaN refuses before it can.
    const nulled = Expr.lt(Scored.fields.score, given)
    expect(() => truthOver(nulled, { score: null }, { given: Number.NaN })).toThrow(/NaN/)
    const row = Option.getOrThrow(
      Held.rows([{ entity: Scored, rows: [{ id: 'x', a: 'x', b: 'y' }] }]).row(Scored, 'x'),
    )
    expect(() => Judge.query(body, { given: Number.NaN }, row)).toThrow(/NaN/)
  })
})

describe('a where list', () => {
  const row = { id: 'r', a: 'x', b: `y${String.fromCharCode(0)}`, score: 1 }
  const misses = Expr.eq(Scored.fields.a, 'nope')
  const nul = Expr.contains(Scored.fields.b, 'y')

  it.each([
    { what: 'the failing predicate first', where: [misses, nul] },
    { what: 'the refusing predicate first', where: [nul, misses] },
    { what: 'one and of both', where: [Expr.and(misses, nul)] },
  ])('refuses a row whatever its order: $what', ({ where }) => {
    const body = from.pipe(Query.where(...where))
    expect(() => evaluate(body, {}, [row])).toThrow(/NUL/)
    expect(evaluateEach(body, {}, [row]).refused).toEqual([row])
  })
})
