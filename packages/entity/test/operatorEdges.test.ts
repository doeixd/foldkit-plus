/**
 * Edges of operator calls the review of the operator work found: a locale a
 * call may not carry, a boolean of the wrong kind, a constant holding a NUL,
 * one row ordered as many are, a value never given, and a nesting that must
 * build in linear time.
 */
import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  Collation,
  Entity,
  Expr,
  Operators,
  Order,
  Query,
  QueryEvaluateError,
  Text,
  evaluate,
  evaluateEach,
} from '../src/index.js'

const Item = Entity.define(
  'Item',
  Schema.Struct({
    id: Schema.String,
    code: Schema.String,
    title: Schema.String,
    flag: Schema.Boolean,
    rank: Schema.Int,
  }),
).pipe(
  Entity.annotateMembers({
    code: Collation.of(Collation.binary),
    title: Collation.of(Collation.locale('en_US')),
  }),
)
const { fields } = Item

/** The later of two texts, under the collation they share. */
const later = Expr.operator('acme.later', {
  input: [Schema.String, Schema.String],
  output: Schema.String,
  collation: 'operands',
})

describe('A call', () => {
  it('carries no locale, from its text or given to it', () => {
    expect(() => later(fields.title, 'b')).toThrow(/"en_US" collation, which a call cannot carry/)
    expect(() => later('a', 'b', { collation: Collation.locale('de_DE') })).toThrow(
      /"de_DE" collation, which only that backend has/,
    )
  })

  it('takes a boolean only where a boolean is wanted, and gives one only there', () => {
    const negated = Expr.operator('acme.negated', {
      input: [Schema.Boolean],
      output: Schema.Boolean,
    })
    // The types refuse both; the run-time check is for a caller without them.
    expect(() =>
      // @ts-expect-error text where a boolean is taken
      negated(fields.code),
    ).toThrow('is stored as text, but the operator takes boolean')
    expect(() =>
      // @ts-expect-error a boolean where text is taken
      Text.startsWith(fields.flag, 'x', { collation: Collation.binary }),
    ).toThrow('is stored as boolean, but the operator takes text')
  })

  it('builds a nesting of shared arguments in time linear in its depth', () => {
    let deep: ReturnType<typeof later> = later(fields.code, 'x')
    const started = performance.now()
    for (let level = 0; level < 24; level++) deep = later(deep, deep)
    // Rendering each argument's name on every call doubled the time per level.
    expect(performance.now() - started).toBeLessThan(1_000)
  })
})

describe('Judging rows one at a time', () => {
  it('refuses the run, not each row, for a constant holding a NUL', () => {
    const body = Query.from(Item).pipe(
      Query.where(Text.startsWith(fields.code, Expr.literal(`a${String.fromCharCode(0)}`))),
    )
    const rows = [{ id: 'i1', code: 'ab', title: 't', flag: true, rank: 1 }]
    expect(() => evaluateEach(body, {}, rows)).toThrow(QueryEvaluateError)
  })
})

describe('One row ordered', () => {
  const failing = Expr.operator('acme.failing', { input: [Schema.Int], output: Schema.Int })
  const operators = Operators.merge(
    Operators.kernel,
    Operators.memory(
      Operators.implement(failing, () => {
        throw new Error('no order for this')
      }),
    ),
  )
  const row = { id: 'i1', code: 'ab', title: 't', flag: true, rank: 1 }

  it('works out its keys, and is refused as many rows are', () => {
    const body = Query.from(Item).pipe(Query.orderBy(Order.asc(failing(fields.rank))))
    expect(() => evaluate(body, {}, [row], { operators })).toThrow(QueryEvaluateError)
    expect(evaluateEach(body, {}, [row], { operators }).refused).toEqual([row])
  })

  it('is refused under a locale, as many rows are', () => {
    const body = Query.from(Item).pipe(Query.orderBy(Order.asc(fields.title)))
    expect(() => evaluate(body, {}, [row])).toThrow(QueryEvaluateError)
  })
})

describe('An operator that handles null', () => {
  it('is given null, never undefined, for an input left out', () => {
    const given = Expr.operator('acme.given', {
      input: [Schema.NullOr(Schema.String)],
      output: Schema.Boolean,
      nulls: 'handled',
    })
    const seen: Array<unknown> = []
    const operators = Operators.memory(
      Operators.implementHandlingNulls(given, value => {
        seen.push(value)
        return value !== null
      }),
    )
    const body = Query.from(Item).pipe(
      Query.where(given(Expr.input('maybe', Schema.NullOr(Schema.String)))),
    )
    evaluate(body, {}, [{ id: 'i1', code: 'ab', title: 't', flag: true, rank: 1 }], {
      operators,
    })
    expect(seen).toEqual([null])
  })
})
