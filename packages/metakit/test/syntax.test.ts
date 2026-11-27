import { Effect, pipe, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Bool, Expr, Num, Ord } from '../src/index.js'
import * as Language from '../src/language.js'
import * as Operation from '../src/operation.js'
import * as OperationSql from '../src/operationSql.js'
import * as Syntax from '../src/syntax.js'

// ---------------------------------------------------------------------------
// Independent DSL #1: Pricing / Billing rules
// ---------------------------------------------------------------------------

const ApplyDiscount = Operation.define({
  id: 'pricing.discount',
  version: 1,
  args: [Schema.Int, Schema.Int] as const,
  returns: Schema.Int,
  nulls: 'strict',
})

const ClampPrice = Operation.define({
  id: 'pricing.clamp',
  version: 1,
  args: [Schema.Int, Schema.Int, Schema.Int] as const,
  returns: Schema.Int,
  nulls: 'strict',
})

const PricingLang = Language.make({
  pricing: {
    discount: ApplyDiscount,
    clamp: ClampPrice,
  },
})

const pricingImpls = PricingLang.implement('pricing-js', {
  pricing: {
    discount: (price, bps) => price - Math.trunc((price * bps) / 10000),
    clamp: (price, lo, hi) => Math.max(lo, Math.min(hi, price)),
  },
})

const pricingSql = OperationSql.lowerings(
  OperationSql.lowering(ApplyDiscount, {
    postgres: (p, bps) => OperationSql.piece`(${p} - ((${p} * ${bps}) / 10000))`,
    sqlite: (p, bps) => OperationSql.piece`(${p} - ((${p} * ${bps}) / 10000))`,
  }),
  OperationSql.lowering(ClampPrice, {
    postgres: (p, lo, hi) => OperationSql.piece`GREATEST(${lo}, LEAST(${hi}, ${p}))`,
    sqlite: (p, lo, hi) => OperationSql.piece`MAX(${lo}, MIN(${hi}, ${p}))`,
  }),
)

// ---------------------------------------------------------------------------
// Independent DSL #2: Staged Query builder grammar
// ---------------------------------------------------------------------------

const QueryGrammar = Syntax.grammar('Initial', {
  Initial: { from: 'Source' },
  Source: { where: 'Source', select: 'Selected' },
  Selected: { orderBy: 'Selected', limit: 'Selected', build: 'Complete' },
  Complete: {},
} as const)

describe('metakit/syntax (#647 P0/P1)', () => {
  it('dual preserves operand order for non-commutative ops with explicit self: 0 and self: 1', () => {
    const Cart = Schema.Struct({ subtotal: Schema.Int, bps: Schema.Int })

    const discount0 = Syntax.dual(ApplyDiscount, { self: 0 })
    const discount1 = Syntax.dual(ApplyDiscount, { self: 1 })
    const clamp0 = Syntax.dual(ClampPrice, { self: 0 })

    // Data-first vs data-last with self: 0 (price is receiver)
    const df = Expr.in({ cart: Cart }, ({ cart }) => discount0(cart.subtotal, cart.bps))
    const dl0 = Expr.in({ cart: Cart }, ({ cart }) =>
      pipe(cart.subtotal, discount0(cart.bps), clamp0(100, 5000)),
    )
    // Data-last with self: 1 (bps is receiver, price is fixed first arg)
    const dl1 = Expr.in({ cart: Cart }, ({ cart }) => pipe(cart.bps, discount1(cart.subtotal)))

    const env = { cart: { subtotal: 1000, bps: 1500 } } // 1000 - 150 = 850
    expect(Expr.evaluate(df, env, { foreign: pricingImpls })).toBe(850)
    expect(Expr.evaluate(dl0, env, { foreign: pricingImpls })).toBe(850)
    expect(Expr.evaluate(dl1, env, { foreign: pricingImpls })).toBe(850)

    // Non-commutative check: pipe(1500, discount0(1000)) = 1500 - 150 = 1350 !== 850
    const swapped = Expr.in({ cart: Cart }, ({ cart }) => pipe(cart.bps, discount0(cart.subtotal)))
    expect(Expr.evaluate(swapped, env, { foreign: pricingImpls })).toBe(1350)

    // Out-of-range self position throws loudly
    expect(() => Syntax.dual(ApplyDiscount, { self: 2 as never })).toThrow(RangeError)
  })

  it('dualLanguage derives pipeable namespaces and rejects reserved property names', () => {
    const P = Syntax.dualLanguage(PricingLang)
    const Cart = Schema.Struct({ subtotal: Schema.Int })
    const expr = Expr.in({ cart: Cart }, ({ cart }) =>
      cart.subtotal.pipe(P.pricing.discount(1000), P.pricing.clamp(500, 10000)),
    )

    expect(Expr.evaluate(expr, { cart: { subtotal: 2000 } }, { foreign: pricingImpls })).toBe(1800)
    expect(Expr.evaluate(expr, { cart: { subtotal: 400 } }, { foreign: pricingImpls })).toBe(500)

    const BadLang = Language.make({
      pricing: { then: ApplyDiscount },
    })
    expect(() => Syntax.dualLanguage(BadLang)).toThrow(/reserved operation name/)
  })

  it('grammar enforces staged transitions at compile time and validates dynamic sequences at runtime', async () => {
    const s0 = QueryGrammar.start({ table: '' as string, filters: 0, limit: 0 })
    const s1 = QueryGrammar.step(s0, 'from', ctx => ({ ...ctx, table: 'products' }))
    const s2 = QueryGrammar.step(s1, 'where', ctx => ({ ...ctx, filters: ctx.filters + 1 }))
    const s3 = QueryGrammar.step(s2, 'select', ctx => ctx)
    const s4 = QueryGrammar.step(s3, 'limit', ctx => ({ ...ctx, limit: 10 }))
    const done = QueryGrammar.step(s4, 'build', ctx => ctx)

    expect(done.state).toBe('Complete')
    expect(done.context).toEqual({ table: 'products', filters: 1, limit: 10 })
    expect(done.steps).toEqual(['from', 'where', 'select', 'limit', 'build'])

    // Runtime validation accepts valid sequence and rejects illegal order or incomplete terminal
    const valid = await Effect.runPromise(QueryGrammar.validate(done.steps, ['Complete']))
    expect(valid).toBe('Complete')

    const badOrder = await Effect.runPromise(
      Effect.flip(QueryGrammar.validate(['from', 'limit', 'select'])),
    )
    expect(badOrder._tag).toBe('GrammarViolationError')
    expect(badOrder.stepIndex).toBe(1)
    expect(badOrder.transition).toBe('limit')
    expect(badOrder.allowed).toEqual(['select', 'where'])

    const incomplete = await Effect.runPromise(
      Effect.flip(QueryGrammar.validate(['from', 'select'], ['Complete'])),
    )
    expect(incomplete._tag).toBe('GrammarViolationError')
    expect(incomplete.transition).toBe('<end>')
  })

  it('testLanguage runs shared artifact round-trip, fingerprint, differential JS, and readiness checks', async () => {
    const Cart = Schema.Struct({ subtotal: Schema.Int, bps: Schema.Int })
    const P = Syntax.dualLanguage(PricingLang)

    const report = await Effect.runPromise(
      Syntax.testLanguage({
        language: PricingLang,
        foreign: pricingImpls,
        lowerings: pricingSql,
        dialects: ['postgres', 'sqlite'],
        cases: [
          Syntax.testCase({
            name: 'discounted-clamped-price',
            env: { cart: Cart },
            result: Schema.Int,
            expr: Expr.in({ cart: Cart }, ({ cart }) =>
              cart.subtotal.pipe(P.pricing.discount(cart.bps), P.pricing.clamp(100, 5000)),
            ),
            samples: [
              { cart: { subtotal: 1000, bps: 1000 } },
              { cart: { subtotal: 50, bps: 0 } },
              { cart: { subtotal: 10000, bps: 500 } },
            ],
          }),
          Syntax.testCase({
            name: 'eligible-after-discount',
            env: { cart: Cart },
            result: Schema.Boolean,
            expr: Expr.in({ cart: Cart }, ({ cart }) =>
              Bool.and(
                Ord.gte(cart.subtotal, 0),
                Ord.lte(Num.sub(cart.subtotal, P.pricing.discount(cart.subtotal, cart.bps)), 500),
              ),
            ),
            samples: [
              { cart: { subtotal: 1000, bps: 2000 } },
              { cart: { subtotal: 5000, bps: 2000 } },
            ],
          }),
        ],
      }),
    )

    expect(report.passed).toBe(true)
    expect(report.failures).toEqual([])
    expect(report.cases).toHaveLength(2)
    expect(report.cases[0]?.evidence).toBe('tested')
    expect(report.cases[0]?.jsReady).toBe(true)
    expect(report.cases[0]?.sqlReady).toEqual({ postgres: true, sqlite: true })
  })
})
