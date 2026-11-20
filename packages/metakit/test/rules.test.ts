import { Option, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Expr, Num } from 'metakit'

const shown = (schema: Schema.Top) =>
  Expr.rulesOf(schema).map(rule => ({
    at: rule.at,
    expr: Expr.show(rule.expr),
    message: rule.message,
  }))

describe('Expr.rulesOf', () => {
  it("reads Expr.refine's message on the struct itself", () => {
    const Account = Schema.Struct({ balance: Schema.Number, reserved: Schema.Number }).pipe(
      Expr.refine($ => Num.lte($.reserved, $.balance), { message: 'reserved exceeds balance' }),
      Expr.refine($ => Num.gte($.balance, 0)),
    )
    expect(shown(Account)).toEqual([
      { at: [], expr: '(reserved <= balance)', message: Option.some('reserved exceeds balance') },
      { at: [], expr: '(balance >= 0)', message: Option.none() },
    ])
  })

  it("reads an Effect check's message and the property it sits on, nested structs included", () => {
    const Order = Schema.Struct({
      amount: Schema.Number.check(Schema.isGreaterThan(0, { message: 'must be positive' })),
      address: Schema.Struct({
        zip: Schema.Number.check(
          Schema.isBetween({ minimum: 1000, maximum: 9999 }, { message: 'four digits' }),
        ),
      }),
    })
    expect(shown(Order)).toEqual([
      { at: ['amount'], expr: '(amount > 0)', message: Option.some('must be positive') },
      {
        at: ['address', 'zip'],
        expr: '(address.zip >= 1000)',
        message: Option.some('four digits'),
      },
      {
        at: ['address', 'zip'],
        expr: '(address.zip <= 9999)',
        message: Option.some('four digits'),
      },
    ])
    const [amount] = Expr.rulesOf(Order)
    const order = { amount: 0, address: { zip: 1234 } }
    expect(Expr.eval(amount!.expr, order)).toBe(false)
    expect(Expr.eval(amount!.expr, { ...order, amount: 1 })).toBe(true)
  })

  it("gives a group's message to the checks inside it that have none", () => {
    const Count = Schema.Struct({
      n: Schema.Number.check(
        Schema.isGreaterThan(0).and(Schema.isLessThan(10, { message: 'under ten' }), {
          message: 'one to nine',
        }),
      ),
    })
    expect(shown(Count)).toEqual([
      { at: ['n'], expr: '(n > 0)', message: Option.some('one to nine') },
      { at: ['n'], expr: '(n < 10)', message: Option.some('under ten') },
    ])
  })

  it('does not read a check on a nullable or optional property', () => {
    const Row = Schema.Struct({
      a: Schema.NullOr(Schema.Number.check(Schema.isGreaterThan(0))),
      b: Schema.optional(Schema.Number.check(Schema.isGreaterThan(0))),
    })
    expect(Expr.rulesOf(Row)).toEqual([])
  })

  it('reads each side of an isBetween with its own exclusivity', () => {
    const lowOpen = Schema.Number.check(
      Schema.isBetween({ minimum: 0, maximum: 10, exclusiveMinimum: true }),
    )
    const highOpen = Schema.Number.check(
      Schema.isBetween({ minimum: 0, maximum: 10, exclusiveMaximum: true }),
    )
    expect(Expr.refinementsOf(lowOpen).map(Expr.show)).toEqual(['($ > 0)', '($ <= 10)'])
    expect(Expr.refinementsOf(highOpen).map(Expr.show)).toEqual(['($ >= 0)', '($ < 10)'])
  })

  it('refuses a one-sided isBetween at construction, so none reaches refinementsOf', () => {
    expect(() => Schema.isBetween({ minimum: 0, maximum: Number.POSITIVE_INFINITY })).toThrow(
      'Expected a finite number',
    )
  })
})
