import { Option, Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Abstract, Expr, Null, Num, Path, Str, Verdict } from 'metakit'
import * as Sql from 'metakit/sql'

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

  it('reads checks under NullOr, optional, and optionalKey guarded by null.isNull', () => {
    const NonEmpty = Schema.String.pipe(
      Expr.refine($ => Num.gt(Str.len($), 0), { message: 'non-empty' }),
    )
    const Row = Schema.Struct({
      a: Schema.NullOr(Schema.Number.check(Schema.isGreaterThan(0))),
      b: Schema.optional(NonEmpty),
      c: Schema.optionalKey(NonEmpty),
      d: Schema.optional(Schema.NullOr(NonEmpty)),
      multi: Schema.Union([NonEmpty, Schema.Number]),
    })
    expect(shown(Row)).toEqual([
      { at: ['a'], expr: '(null.isNull(a) || (a > 0))', message: Option.none() },
      {
        at: ['b'],
        expr: '(null.isNull(b) || (str.len(b) > 0))',
        message: Option.some('non-empty'),
      },
      {
        at: ['c'],
        expr: '(null.isNull(c) || (str.len(c) > 0))',
        message: Option.some('non-empty'),
      },
      {
        at: ['d'],
        expr: '(null.isNull(d) || (str.len(d) > 0))',
        message: Option.some('non-empty'),
      },
    ])

    const rules = Expr.rulesOf(Row)
    expect(Expr.holds(rules[0]!.expr, { a: null, multi: 0 })).toBe(true)
    expect(Expr.holds(rules[0]!.expr, { a: 1, multi: 0 })).toBe(true)
    expect(Expr.holds(rules[0]!.expr, { a: 0, multi: 0 })).toBe(false)
    expect(Expr.holds(rules[1]!.expr, { a: null, multi: 0 })).toBe(true)
    expect(Expr.holds(rules[1]!.expr, { a: null, b: 'ok', multi: 0 })).toBe(true)
    expect(Expr.holds(rules[1]!.expr, { a: null, b: '', multi: 0 })).toBe(false)

    const Doc = Schema.Struct({
      note: Schema.optional(NonEmpty),
      tag: Schema.NullOr(NonEmpty),
    })
    const pg = Sql.toCheck(Doc, { dialect: 'postgres' })
    const sqlite = Sql.toCheck(Doc, { dialect: 'sqlite' })
    expect(Result.isSuccess(pg)).toBe(true)
    expect(Result.isSuccess(sqlite)).toBe(true)
    if (Result.isSuccess(pg)) {
      expect(pg.success).toBe(
        'CHECK (((("note" IS NULL) OR (char_length("note") > 0)) AND (("tag" IS NULL) OR (char_length("tag") > 0))) IS TRUE)',
      )
    }
    if (Result.isSuccess(sqlite)) {
      expect(sqlite.success).toBe(
        'CHECK (((("note" IS NULL) OR (length("note") > 0)) AND (("tag" IS NULL) OR (length("tag") > 0))) IS TRUE)',
      )
    }

    const Score = Schema.Struct({
      score: Schema.NullOr(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
    })
    const $ = Path.from(Score)
    const verdict = Abstract.checkInvariant(
      Score,
      Expr.implies(Null.isNotNull($.score), Num.gte($.score, 0)),
    )
    expect(Verdict.isTrue(verdict)).toBe(true)
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
