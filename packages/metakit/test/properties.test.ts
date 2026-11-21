import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Abstract, Bool, Eq, Expr, Num, Ord, Path, Verdict, opProperties } from 'metakit'
import * as Conformance from 'metakit/conformance'

const resolve = (id: keyof typeof Conformance.coreOps) => Conformance.coreOps[id]
const binary = { arity: 2, resolve }

describe('opProperties', () => {
  const reports = Conformance.checkAllProperties()

  it.each(reports)('every property declared of $op holds over the awkward values', report => {
    expect(report.failures.slice(0, 5)).toEqual([])
  })

  it('checks each operation that declares something, and every operation has a row', () => {
    expect(reports.map(report => report.op)).toEqual(Object.keys(Conformance.coreOps))
    const declaring = Object.entries(opProperties)
      .filter(([, row]) => Object.keys(row).length > 0)
      .map(([id]) => id)
    expect(declaring.length).toBeGreaterThan(5)
    for (const id of declaring) {
      expect(reports.find(report => report.op === id)?.checked).toBeGreaterThan(3)
    }
  })

  it.each([
    ['commutative on num.sub', Num.subOp, { commutative: true }],
    ['identity 0 on the left of num.sub', Num.subOp, { identity: { value: 0, side: 'left' } }],
    ['monotone up in both arguments of num.sub', Num.subOp, { monotone: ['up', 'up'] }],
    ['monotone up in num.neg', Num.negOp, { monotone: ['up'] }],
    // Two groupings of floats round differently: 0.5 + 1e200 - 1e200.
    ['associative unless refused on num.add', Num.addOp, { associative: 'unless-refused' }],
    [
      'invertible num.add by num.sub over floats',
      Num.addOp,
      { invertible: { inverse: 'num.sub' } },
    ],
    [
      'absorbing false of bool.or',
      Bool.orOp,
      { absorbing: { value: false, result: false, side: 'both' } },
    ],
    ['idempotent num.add', Num.addOp, { idempotent: true }],
    ['involution of num.mul', Num.mulOp, { involution: true }],
    ['reflexive true of eq.isNot', Eq.isNotOp, { reflexive: { value: true } }],
  ] as const)('a false declaration is caught: %s', (_, op, properties) => {
    const report = Conformance.checkProperties(op, properties, {
      ...binary,
      arity: op === Num.negOp ? 1 : 2,
    })
    expect(report.ok).toBe(false)
    expect(report.failures.length).toBeGreaterThan(0)
  })

  it('a true declaration the table leaves out is confirmed: commutative bool.and', () => {
    expect(Conformance.checkProperties(Bool.andOp, { commutative: true }, binary).ok).toBe(true)
    expect(Conformance.checkProperties(Bool.andOp, { associative: 'always' }, binary).ok).toBe(true)
  })
})

describe('the checker bounds arithmetic from the declared directions', () => {
  const Pair = Schema.Struct({
    x: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 5 })),
    y: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 5 })),
  })
  const $ = Path.forSchema(Pair)

  it.each([
    ['x + y <= 10', Ord.lte(Num.add($.x, $.y), 10)],
    ['x - y >= -5', Ord.gte(Num.sub($.x, $.y), -5)],
    ['-x <= 0', Ord.lte(Num.neg($.x), 0)],
  ] as const)('%s is proved', (_, goal) => {
    expect(Verdict.isTrue(Abstract.checkInvariant(Pair, goal))).toBe(true)
  })

  it('bounds a sum of floats, which no difference constraint relates', () => {
    const Floats = Schema.Struct({
      x: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 5 })),
      y: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 5 })),
    })
    const f = Path.forSchema(Floats)
    expect(Verdict.isTrue(Abstract.checkInvariant(Floats, Ord.lte(Num.add(f.x, f.y), 10)))).toBe(
      true,
    )
  })

  it('and stays undecided where the bound does not hold', () => {
    expect(Verdict.isTrue(Abstract.checkInvariant(Pair, Ord.lte(Num.sub($.x, $.y), 4)))).toBe(false)
  })
})

describe('partial evaluation reads the table', () => {
  const Row = Schema.Struct({ n: Schema.Int, b: Schema.Boolean })
  const $ = Path.forSchema(Row)

  it.each<readonly [string, Expr.Expr<typeof Row.Type, unknown>, unknown]>([
    ['x + 0', Num.add($.n, 0), $.n.node],
    ['0 + x', Num.add(0, $.n), $.n.node],
    ['x - 0', Num.sub($.n, 0), $.n.node],
    ['x * 1', Num.mul($.n, 1), $.n.node],
    ['--x', Num.neg(Num.neg($.n)), $.n.node],
    ['b and true', Bool.and($.b, true), $.b.node],
    ['b or b', Bool.or($.b, $.b), $.b.node],
    ['b and false', Bool.and($.b, false), { _tag: 'Lit', value: false }],
    ['n == n', Eq.is($.n, $.n), { _tag: 'Lit', value: true }],
  ])('%s shrinks', (_, expr, residual) => {
    expect(Expr.residualize(expr, {}).node).toEqual(residual)
  })

  it('0 - x does not shrink: identity holds on the right only', () => {
    expect(Expr.residualize(Num.sub(0, $.n), {}).node._tag).toBe('Call')
  })
})
