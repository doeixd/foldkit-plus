/**
 * Judging rows one at a time: a row whose own values are refused is set aside,
 * and what no one row causes still refuses the run. expr-operations-DESIGN §15,
 * question 10.
 */
import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  Entity,
  Expr,
  Operators,
  Order,
  Query,
  QueryEvaluateError,
  evaluateEach,
} from '../src/index.js'

const Doc = Entity.define(
  'Doc',
  Schema.Struct({ id: Schema.String, title: Schema.String, rank: Schema.Int }),
)
const { fields } = Doc

/** A rank's root: refused for a negative one, as an operator may refuse a value. */
const root = Expr.operator('acme.root', { input: [Schema.Int], output: Schema.Number })
const operators = Operators.merge(
  Operators.kernel,
  Operators.memory(
    Operators.implement(root, rank => {
      if (rank < 0) throw new Error('no root of a negative rank')
      return Math.sqrt(rank)
    }),
  ),
)

const NUL = String.fromCharCode(0)
const title = Expr.input('title', Schema.String)
const byTitle = Query.from(Doc).pipe(
  Query.where(Expr.eq(fields.title, title)),
  Query.orderBy(Order.desc(fields.rank)),
)
const ids = (rows: ReadonlyArray<Record<string, unknown>>) => rows.map(row => row.id)

describe('A row judged alone', () => {
  it('sets aside a row holding a NUL, and still answers the others in order', () => {
    const judged = evaluateEach(
      byTitle,
      { title: 'Intro' },
      [
        { id: 'a', title: 'Intro', rank: 1 },
        { id: 'b', title: `In${NUL}tro`, rank: 5 },
        { id: 'c', title: 'Intro', rank: 3 },
        { id: 'd', title: 'Other', rank: 4 },
      ],
      { operators },
    )
    expect(ids(judged.matched)).toEqual(['c', 'a'])
    expect(ids(judged.refused)).toEqual(['b'])
  })

  it('sets aside a matching row whose order key an operator refuses', () => {
    const byRoot = Query.from(Doc).pipe(Query.orderBy(Order.asc(root(fields.rank))))
    const judged = evaluateEach(
      byRoot,
      {},
      [
        { id: 'a', title: 'x', rank: 9 },
        { id: 'b', title: 'x', rank: -1 },
        { id: 'c', title: 'x', rank: 4 },
      ],
      { operators },
    )
    expect(ids(judged.matched)).toEqual(['c', 'a'])
    expect(ids(judged.refused)).toEqual(['b'])
  })
})

describe('What no one row causes refuses the run', () => {
  const rows = [{ id: 'a', title: 'Intro', rank: 1 }]

  it('an input the body reads holding a NUL', () => {
    expect(() => evaluateEach(byTitle, { title: `In${NUL}tro` }, rows, { operators })).toThrow(
      QueryEvaluateError,
    )
  })

  it('but not an input the body does not read', () => {
    // A row that refuses is still that row's doing.
    const judged = evaluateEach(
      byTitle,
      { title: 'Intro', note: `a${NUL}b` },
      [...rows, { id: 'b', title: `In${NUL}tro`, rank: 2 }],
      { operators },
    )
    expect(ids(judged.matched)).toEqual(['a'])
    expect(ids(judged.refused)).toEqual(['b'])
  })

  it('nor an input only an order alternative the input did not choose reads (#299)', () => {
    const distance = Expr.operator('acme.distance', {
      input: [Schema.Int, Schema.Number],
      output: Schema.Number,
    })
    const near = Operators.merge(
      operators,
      Operators.memory(Operators.implement(distance, (rank, to) => Math.abs(rank - to))),
    )
    const sort = Expr.input(
      'sort',
      Schema.Struct({ by: Schema.Literals(['rank', 'near']), direction: Schema.Literal('asc') }),
    )
    const sorted = Query.from(Doc).pipe(
      Query.where(Expr.eq(fields.title, title)),
      Query.orderBy(
        Order.chosen(sort, {
          rank: fields.rank,
          near: distance(fields.rank, Expr.input('extra', Schema.Number)),
        }),
      ),
    )
    const judged = evaluateEach(
      sorted,
      { title: 'Intro', sort: { by: 'rank', direction: 'asc' }, extra: Number.NaN },
      [...rows, { id: 'b', title: `In${NUL}tro`, rank: 2 }],
      { operators: near },
    )
    expect(ids(judged.matched)).toEqual(['a'])
    expect(ids(judged.refused)).toEqual(['b'])
    // Chosen, it is read, and a NaN in it refuses the run.
    expect(() =>
      evaluateEach(
        sorted,
        { title: 'Intro', sort: { by: 'near', direction: 'asc' }, extra: Number.NaN },
        [...rows, { id: 'b', title: `In${NUL}tro`, rank: 2 }],
        { operators: near },
      ),
    ).toThrow(QueryEvaluateError)
  })

  it('an operator the table lacks', () => {
    const byRoot = Query.from(Doc).pipe(Query.orderBy(Order.asc(root(fields.rank))))
    expect(() => evaluateEach(byRoot, {}, rows)).toThrow('acme.root')
  })

  it('order keys of different kinds across rows', () => {
    expect(() =>
      evaluateEach(
        byTitle,
        { title: 'Intro' },
        [
          { id: 'a', title: 'Intro', rank: 1 },
          { id: 'b', title: 'Intro', rank: 'two' },
        ],
        { operators },
      ),
    ).toThrow('cannot compare')
  })
})
