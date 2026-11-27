import { Effect, Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Expr, Num, Ord, Path, Verdict } from '../src/index.js'
import * as Artifact from '../src/artifact.js'
import * as Fn from '../src/fn.js'
import * as Language from '../src/language.js'
import * as Operation from '../src/operation.js'
import * as Prove from '../src/prove.js'
import * as Sql from '../src/sql.js'

const Bounded = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 10_000 }))

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
  })
})
