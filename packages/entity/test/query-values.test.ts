/**
 * A query is a value: its nodes cannot be changed after it is built, a shared
 * node costs one visit however many paths reach it, what it reads is reported
 * per Entity identity, and the reference interpreter answers what the compiled
 * one answers, refusing deterministically what neither can.
 */
import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  Entity,
  Expr,
  Order,
  Query,
  QueryEvaluateError,
  dependenciesOf,
  evaluate,
  type Predicate,
  type Row,
} from '../src/index.js'

const Item = Entity.define(
  'Item',
  Schema.Struct({ id: Schema.String, text: Schema.String, rank: Schema.Number }),
)

/** A predicate whose `_tag` counts its reads, to measure how often a walk visits it. */
const counted = (): { readonly predicate: Predicate; readonly visits: () => number } => {
  let reads = 0
  const predicate = new Proxy(Expr.eq(Item.fields.id, 'a'), {
    get: (target, key, receiver) => {
      if (key === '_tag') reads += 1
      return Reflect.get(target, key, receiver)
    },
  })
  return { predicate, visits: () => reads }
}

/** `leaf` reached through `depth` levels of `eq(n, n)`: 2^depth paths, depth + 1 nodes. */
const shared = (leaf: Predicate, depth: number): Predicate =>
  Array.from({ length: depth }).reduce<Predicate>(node => Expr.eq(node, node), leaf)

describe('a shared expression node (#137)', () => {
  it('is visited a bounded number of times by Query.where, not once per path', () => {
    const { predicate, visits } = counted()
    Query.from(Item).pipe(Query.where(shared(predicate, 12)))
    expect(visits()).toBeLessThan(20)
  })

  it('is visited a bounded number of times by Query.dependencies', () => {
    const { predicate, visits } = counted()
    const query = Query.from(Item).pipe(Query.where(shared(predicate, 12)))
    const before = visits()
    expect(Query.dependencies(query).fields.map(field => field.key)).toEqual(['id'])
    expect(visits() - before).toBeLessThan(20)
  })
})

describe('an expression node (#138)', () => {
  it('is frozen, scalar and predicate alike, so a built query cannot change', () => {
    const nodes = [
      Expr.literal('a'),
      Expr.input('slug', Schema.String),
      Expr.field(Item.fields.id),
      Expr.eq(Item.fields.id, 'a'),
      Expr.isNull(Item.fields.text),
      Expr.isNotNull(Item.fields.text),
      Expr.contains(Item.fields.text, 'a'),
      Order.asc(Item.fields.rank),
    ]
    expect(nodes.filter(node => !Object.isFrozen(node))).toEqual([])
  })

  it('keeps the rows a query matched after someone tries to rewrite its predicate', () => {
    const predicate = Expr.eq(Item.fields.id, 'a')
    const query = Query.from(Item).pipe(Query.where(predicate))
    const rows: ReadonlyArray<Row> = [{ id: 'a' }, { id: 'b' }]
    expect(() => Object.assign(predicate, { right: Expr.literal('b') })).toThrow(TypeError)
    expect(evaluate(query, {}, rows)).toEqual([{ id: 'a' }])
  })
})

describe('dependencies of two Entities that share a name (#139)', () => {
  it('reports one entry per identity, each naming its owner', () => {
    const Other = Entity.define('Item', Schema.Struct({ id: Schema.String }))
    const { fields } = dependenciesOf(Expr.field(Item.fields.id), Expr.field(Other.fields.id))
    expect(fields.map(field => field.owner)).toEqual([Item.identity, Other.identity])
    expect(fields.map(field => `${field.entity}.${field.key}`)).toEqual(['Item.id', 'Item.id'])
  })

  it('still reports a field read twice by one Entity once', () => {
    const { fields } = dependenciesOf(Expr.field(Item.fields.id), Expr.eq(Item.fields.id, 'a'))
    expect(fields).toEqual([{ entity: 'Item', key: 'id', owner: Item.identity }])
  })
})

describe('contains in the reference interpreter (#136)', () => {
  const text = Expr.input('text', Schema.String)
  const search = Expr.input('search', Schema.String)
  const body = Query.from(Item).pipe(Query.where(Expr.contains(text, search)))
  const run = (input: Row) => evaluate(body, input, [{ id: 'a' }]).length === 1

  it('folds ASCII letters only, as the compiled SQL does', () => {
    expect(run({ text: 'Intro', search: 'INTRO' })).toBe(true)
    expect(run({ text: 'Élan', search: 'é' })).toBe(false)
    expect(run({ text: 'Élan', search: 'É' })).toBe(true)
  })

  it('refuses text holding NUL, which SQL text cannot hold portably', () => {
    expect(() => run({ text: 'a\u0000b', search: 'b' })).toThrow(QueryEvaluateError)
    expect(() => run({ text: 'ab', search: '\u0000' })).toThrow(QueryEvaluateError)
  })
})

describe('an ordering the interpreter refuses (#142)', () => {
  const byRank = Query.from(Item).pipe(Query.orderBy(Order.asc(Item.fields.rank)))
  const messageOf = (rows: ReadonlyArray<Row>) => {
    try {
      evaluate(byRank, {}, rows)
      return 'ordered'
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }

  it('names the first row that breaks the order, in row order, whatever the sort compares', () => {
    const mixed = messageOf([{ rank: 1 }, { rank: 2 }, { rank: 3 }, { rank: 'x' }])
    expect(mixed).toContain('(number and string)')
    expect(messageOf([{ rank: 'x' }, { rank: 1 }, { rank: 2 }, { rank: 3 }])).toContain(
      '(string and number)',
    )
  })

  it('refuses a null key wherever it is, even when an earlier term already separates the rows', () => {
    const byIdThenRank = Query.from(Item).pipe(
      Query.orderBy(Order.asc(Item.fields.id), Order.asc(Item.fields.rank)),
    )
    expect(() =>
      evaluate(byIdThenRank, {}, [
        { id: 'a', rank: 1 },
        { id: 'b', rank: null },
      ]),
    ).toThrow(/orders by "rank", which is null in a row/)
  })

  it('still orders one row, with nothing to compare it to', () => {
    expect(messageOf([{ rank: null }])).toBe('ordered')
  })
})
