import { DatabaseSync } from 'node:sqlite'
import { PGlite } from '@electric-sql/pglite'
import { Effect, Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Expr, Null, Num, Ord, Path, Verdict } from '../src/index.js'
import * as Node from '../src/node.js'
import * as Artifact from '../src/artifact.js'
import * as Fn from '../src/fn.js'
import * as Language from '../src/language.js'
import * as Operation from '../src/operation.js'
import * as Prove from '../src/prove.js'
import * as Sql from '../src/sql.js'

const Bounded = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 10_000 }))

const BoundedAdd = Operation.derived({
  id: 'test.boundedAdd',
  version: 1,
  definition: Fn.make({ a: Bounded, b: Bounded }, ({ a, b }) => Num.add(a, b)),
  paramOrder: ['a', 'b'],
  returns: Bounded,
})
const foreign = Operation.implementations('bounded', BoundedAdd.implementation)
const expand = <E, A>(expr: Expr.Expr<E, A>) => Operation.expandDerived(expr, [BoundedAdd])

it('preserves argument and result refusals under expansion and coalesce', () => {
  const badResult = BoundedAdd(9000, 9000)
  const badArgument = BoundedAdd(-1, 2)
  for (const { call, contract } of [
    { call: badResult, contract: 'result' },
    { call: badArgument, contract: 'argument' },
  ]) {
    expect(Expr.evalResult(call, {}, { foreign })).toMatchObject({
      failure: { detail: expect.stringContaining(contract) },
    })
    expect(Expr.evalResult(expand(call), {})).toMatchObject({
      failure: { reason: 'unmatched', detail: expect.stringContaining(contract) },
    })
  }
  for (const { expr, value } of [
    { expr: BoundedAdd(1, 2), value: 3 },
    { expr: Null.coalesce(1, badResult), value: 1 },
    { expr: BoundedAdd(null, -1), value: null },
  ]) {
    expect(Expr.evalResult(expr, {}, { foreign })).toEqual(Result.succeed(value))
    expect(Expr.evalResult(expand(expr), {})).toEqual(Result.succeed(value))
  }
})

it('lowers expanded result and argument guards to SQL in both dialects', async () => {
  const Row = Schema.Struct({ a: Schema.NullOr(Bounded), b: Schema.NullOr(Bounded) })
  const $ = Path.from(Row)
  const sqlite = new DatabaseSync(':memory:')
  const pg = await PGlite.create()
  try {
    sqlite.exec('CREATE TABLE rows (id TEXT PRIMARY KEY, a INTEGER, b INTEGER)')
    await pg.exec('CREATE TABLE rows (id TEXT PRIMARY KEY, a BIGINT, b BIGINT)')
    const fixture = [
      { id: 'badResult', a: 9000, b: 9000 },
      { id: 'badArg', a: -1, b: 2 },
      { id: 'good', a: 1, b: 2 },
      { id: 'nullArg', a: null, b: -1 },
    ] as const
    for (const r of fixture) {
      sqlite.prepare('INSERT INTO rows VALUES (?, ?, ?)').run(r.id, r.a, r.b)
      await pg.query('INSERT INTO rows VALUES ($1, $2, $3)', [r.id, r.a, r.b])
    }

    for (const { expr, selectedIds } of [
      { expr: Ord.gt(BoundedAdd($.a, $.b), 0), selectedIds: ['good'] },
      {
        expr: Ord.gt(Null.coalesce(1, BoundedAdd($.a, $.b)), 0),
        selectedIds: ['badArg', 'badResult', 'good', 'nullArg'],
      },
    ]) {
      const expanded = expand(expr)
      const sq = Result.getOrThrow(Sql.toWhere(expanded, { dialect: 'sqlite', rowPrefix: [] }))
      const ps = Result.getOrThrow(Sql.toWhere(expanded, { dialect: 'postgres', rowPrefix: [] }))
      expect(sq.text).not.toContain(' ELSE ')
      expect(ps.text).not.toContain(' ELSE ')
      const params = sq.params.map(value => {
        if (value === null || typeof value === 'number' || typeof value === 'string') return value
        throw new Error(`unexpected SQLite parameter: ${String(value)}`)
      })
      const sqIds = sqlite
        .prepare(`SELECT id FROM rows WHERE ${sq.text} ORDER BY id`)
        .all(...params)
        .map(row => String(row['id']))
      const pgIds = (
        await pg.query<{ id: string }>(`SELECT id FROM rows WHERE ${ps.text} ORDER BY id`, [
          ...ps.params,
        ])
      ).rows.map(r => r.id)
      expect(sqIds).toEqual(selectedIds)
      expect(pgIds).toEqual(selectedIds)
    }
  } finally {
    sqlite.close()
    await pg.close()
  }
}, 30_000)

it('keeps a call with an integer or custom check that rulesOfExact cannot discharge', () => {
  const Fraction = Operation.derived({
    id: 'test.fraction',
    version: 1,
    definition: Fn.make({ a: Schema.Int }, ({ a }) => Num.add(a, 0.5)),
    paramOrder: ['a'],
    returns: Schema.Int,
  })
  const call = Fraction(2)
  const expanded = Operation.expandDerived(call, [Fraction])
  expect(expanded.node).toEqual(call.node)
  expect(Node.$is('Call')(expanded.node)).toBe(true)
  expect(Sql.toWhere(Ord.gt(expanded, 0))).toMatchObject({
    failure: { reason: expect.stringContaining('test.fraction') },
  })

  const Even = Schema.Int.check(Schema.makeFilter(n => (n % 2 === 0 ? undefined : 'must be even')))
  const AddEven = Operation.derived({
    id: 'test.addEven',
    version: 1,
    definition: Fn.make({ a: Schema.Int, b: Schema.Int }, ({ a, b }) => Num.add(a, b)),
    paramOrder: ['a', 'b'],
    returns: Even,
  })
  const evenCall = AddEven(1, 2)
  const evenExpanded = Operation.expandDerived(evenCall, [AddEven])
  expect(evenExpanded.node).toEqual(evenCall.node)
  expect(Node.$is('Call')(evenExpanded.node)).toBe(true)
})

describe('Operation.derived & Operation.expandDerived (#648 #7 & #597)', () => {
  it('derives JS implementation, preserves named identity in Artifact/Language, and expands cleanly to SQL and Z3', async () => {
    const discountFn = Fn.params({ price: Bounded, off: Bounded })
      .returns(Bounded)
      .body(({ price, off }) =>
        Expr.when(Ord.gte(price, off), { then: Num.sub(price, off), else: 0 }),
      )

    const Discount = Operation.derived({
      id: 'pricing.discount',
      version: 1,
      definition: discountFn,
      paramOrder: ['price', 'off'] as const,
      returns: Bounded,
      claims: { total: true },
    })

    // 1. Auto-derived JS implementation matches canonical Fn
    const impls = Operation.implementations('derived', Discount.implementation)
    const Order = Schema.Struct({ price: Bounded, coupon: Bounded })
    const $ = Path.from(Order)
    const finalPrice = Discount($.price, $.coupon)

    expect(Expr.evaluate(finalPrice, { price: 100, coupon: 30 }, { foreign: impls })).toBe(70)
    expect(Expr.evaluate(finalPrice, { price: 20, coupon: 50 }, { foreign: impls })).toBe(0)

    // 2. Preserves named operation identity in Language and portable Artifact
    const PricingLang = Language.make({ pricing: { discount: Discount } })
    const reg = await Effect.runPromise(Artifact.registry(PricingLang))
    const encoded = await Effect.runPromise(Artifact.encodeExpr(finalPrice))
    expect(
      encoded.requiredOps.some(op => op._tag === 'Foreign' && op.id === 'pricing.discount'),
    ).toBe(true)
    const decoded = await Effect.runPromise(
      Artifact.decodeExpr(JSON.parse(JSON.stringify(encoded)), {
        env: { price: Bounded, coupon: Bounded },
        result: Bounded,
        registry: reg,
      }),
    )
    expect(Expr.evaluate(decoded, { price: 100, coupon: 30 }, { foreign: impls })).toBe(70)

    // 3. Expanding derived ops enables SQL lowering and Z3 verification without hand-written lowerings!
    const rule = Expr.in({ row: Order }, ({ row }) =>
      Ord.lte(Discount(row.price, row.coupon), row.price),
    )
    const expanded = Operation.expandDerived(rule, [Discount])
    const sqlWhere = Sql.toWhere(expanded, { dialect: 'postgres', rowPrefix: ['row'] })
    expect(Result.isSuccess(sqlWhere)).toBe(true)

    const proofFn = Fn.params({ price: Bounded, off: Bounded })
      .returns(Bounded)
      .ensures(({ params, result }) => Ord.lte(result, params.price))
      .body(({ price, off }) => Operation.expandDerived(Discount(price, off), [Discount]))
    expect(Verdict.isTrue(await Effect.runPromise(Prove.fn(proofFn)))).toBe(true)
  })

  it('validates paramOrder at definition time and enforces expansion budget', () => {
    const f = Fn.make({ a: Schema.Int, b: Schema.Int }, ({ a, b }) => Num.add(a, b))

    expect(() =>
      Operation.derived({
        id: 'test.badOrder',
        version: 1,
        definition: f,
        paramOrder: ['a'] as never,
        returns: Schema.Int,
      }),
    ).toThrow(/missing parameter/)

    expect(() =>
      Operation.derived({
        id: 'test.dupOrder',
        version: 1,
        definition: f,
        paramOrder: ['a', 'a'] as never,
        returns: Schema.Int,
      }),
    ).toThrow(/duplicate parameter/)

    const AddDerived = Operation.derived({
      id: 'test.add',
      version: 1,
      definition: f,
      paramOrder: ['a', 'b'] as const,
      returns: Schema.Int,
    })
    const nested = Expr.in({ x: Schema.Int }, ({ x }) =>
      AddDerived(AddDerived(x, 1), AddDerived(x, 2)),
    )
    expect(() => Operation.expandDerived(nested, [AddDerived], { maxNodes: 3 })).toThrow(RangeError)

    // Preserves nulls: 'strict' semantics after expandDerived even when Fn body ignores parameter
    const constFn = Fn.make({ x: Schema.Int }, () => 42)
    const StrictConst = Operation.derived({
      id: 'test.strictConst',
      version: 1,
      definition: constFn,
      paramOrder: ['x'] as const,
      returns: Schema.Int,
    })
    const strictImpls = Operation.implementations('strict', StrictConst.implementation)
    const callNull = Expr.in({ x: Schema.NullOr(Schema.Int) }, ({ x }) => StrictConst(x))
    const expandedNull = Operation.expandDerived(callNull, [StrictConst])
    expect(Expr.evaluate(callNull, { x: null }, { foreign: strictImpls })).toBeNull()
    expect(Expr.evaluate(expandedNull, { x: null })).toBeNull()
    expect(Expr.evaluate(expandedNull, { x: 7 })).toBe(42)

    // Rejects Fn definitions carrying where/ensures/obligations
    const constrainedFn = Fn.make({ x: Schema.Int }, ({ x }) => x).where(({ x }) => Ord.gt(x, 0))
    expect(() =>
      Operation.derived({
        id: 'test.constrained',
        version: 1,
        definition: constrainedFn,
        paramOrder: ['x'] as const,
        returns: Schema.Int,
      }),
    ).toThrow(/where\/ensures\/obligations/)
  })
})
