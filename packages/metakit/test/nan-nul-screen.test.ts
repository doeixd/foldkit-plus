/**
 * Decision 19 (#655 / K6): every equality refuses NaN (`non-finite`) before
 * null decides, a `Match` refuses a subject holding a NUL (`unportable`),
 * building a `Match` with a case label holding a NUL throws, and every reader
 * agrees with evaluation.
 */
import { Effect, Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Abstract, Eq, Expr, Node, Path, Verdict } from '@doeixd/metakit'
import { OrderedEnum, Text } from '@doeixd/metakit/domain'
import * as Prove from '@doeixd/metakit/prove'

const Row = Schema.Struct({
  n: Schema.Number,
  m: Schema.NullOr(Schema.Number),
  i: Schema.Int,
  f: Schema.Finite,
  s: Schema.NullOr(Schema.String),
  t: Text.schema,
})
const $ = Path.forSchema(Row)

const row = (overrides: Partial<typeof Row.Type> = {}): typeof Row.Type => ({
  n: 1,
  m: 1,
  i: 1,
  f: 1,
  s: 'a',
  t: 'a',
  ...overrides,
})

describe('equality refuses NaN before null decides', () => {
  const cases: ReadonlyArray<
    readonly [string, Expr.Expr<typeof Row.Type, boolean>, Partial<typeof Row.Type>]
  > = [
    ['Eq.is(NaN, NaN)', Eq.is($.n, $.n), { n: Number.NaN }],
    ['Eq.is(NaN, null)', Eq.is($.n, null), { n: Number.NaN }],
    ['Eq.is(null, NaN)', Eq.is($.m, $.n), { m: null, n: Number.NaN }],
    ['Eq.isNot(NaN, 1)', Eq.isNot($.n, 1), { n: Number.NaN }],
    ['Eq.isNot(NaN, null)', Eq.isNot($.n, null), { n: Number.NaN }],
    ['Eq.in(NaN, [1])', Eq.in($.n, [1]), { n: Number.NaN }],
    ['Eq.in(1, [NaN])', Eq.in($.n, [Number.NaN]), { n: 1 }],
    ['Eq.in(NaN, [])', Eq.in($.n, []), { n: Number.NaN }],
  ]

  it.each(cases)('%s evaluates to a non-finite refusal', (_, expr, overrides) => {
    const result = Expr.evalResult(expr, row(overrides))
    expect(Result.isFailure(result)).toBe(true)
    if (Result.isFailure(result)) {
      expect(result.failure.reason).toBe('non-finite')
    }
  })

  it.each(cases)('%s is refused by judge and residualize when known', (_, expr, overrides) => {
    const verdict = Expr.judge(expr, row(overrides))
    expect(Verdict.isUnknown(verdict)).toBe(true)
    const residual = Expr.residualize(expr, row(overrides))
    expect(Node.$is('Lit')(residual.node) && Node.isRefusal(residual.node.value)).toBe(true)
    if (Node.$is('Lit')(residual.node) && Node.isRefusal(residual.node.value)) {
      expect(residual.node.value.reason).toBe('non-finite')
    }
  })

  it.each<
    readonly [string, Expr.Expr<typeof Row.Type, boolean>, Partial<typeof Row.Type>, boolean]
  >([
    ['Eq.is(1, 1)', Eq.is($.n, 1), { n: 1 }, true],
    ['Eq.is(null, null)', Eq.is($.m, null), { m: null }, true],
    ['Eq.in(2, [1, 2])', Eq.in($.n, [1, 2]), { n: 2 }, true],
  ])('unchanged: %s evaluates to %s', (_, expr, overrides, expected) => {
    expect(Expr.evaluate(expr, row(overrides))).toBe(expected)
  })
})

describe('Match refuses a subject holding a NUL', () => {
  const matched = Expr.matchOrElse($.s, { a: 1 }, 99)

  it('refuses a NUL subject as unportable before choosing any arm or fallback', () => {
    const result = Expr.evalResult(matched, row({ s: 'a\u0000' }))
    expect(Result.isFailure(result)).toBe(true)
    if (Result.isFailure(result)) {
      expect(result.failure.reason).toBe('unportable')
      expect(result.failure.at).toBe('match')
    }
    const residual = Expr.residualize(matched, { s: 'a\u0000' })
    expect(Node.$is('Lit')(residual.node) && Node.isRefusal(residual.node.value)).toBe(true)
  })

  it('takes the fallback for a non-matching non-NUL subject and for null', () => {
    expect(Expr.evaluate(matched, row({ s: 'b' }))).toBe(99)
    expect(Expr.evaluate(matched, row({ s: null }))).toBe(99)
    expect(Expr.evaluate(matched, row({ s: 'a' }))).toBe(1)
  })

  it('throws where built when a Match case label holds a NUL', () => {
    expect(() => Expr.matchOrElse($.s, { 'a\u0000': 1 }, 0)).toThrow(/\\u0000/)
    const WithNul = Schema.Struct({ tag: Schema.Literals(['a', 'b\u0000']) })
    const w = Path.forSchema(WithNul)
    expect(() => Expr.match(w.tag, { a: 1, 'b\u0000': 2 })).toThrow(/\\u0000/)
    expect(() => OrderedEnum.make(['a', 'b\u0000'])).toThrow(/\\u0000/)
  })
})

describe('readers agree on NaN equality and NUL Match', () => {
  it('judge and residualize do not fold reflexive equality over plain Schema.Number', () => {
    const plainEq = Eq.is($.n, $.n)
    const plainNeq = Eq.isNot($.n, $.n)
    const plainInEmpty = Eq.in($.n, [])

    expect(Verdict.isTrue(Expr.judge(plainEq, {}))).toBe(false)
    expect(Verdict.isFalse(Expr.judge(plainNeq, {}))).toBe(false)
    expect(Verdict.isFalse(Expr.judge(plainInEmpty, {}))).toBe(false)
    expect(Expr.residualize(plainEq, {}).node._tag).toBe('Call')
    expect(Expr.residualize(plainNeq, {}).node._tag).toBe('Call')
    expect(Expr.residualize(plainInEmpty, {}).node._tag).toBe('Call')
  })

  it('judge and residualize still fold reflexive equality over Schema.Int and Schema.Finite', () => {
    expect(Verdict.isTrue(Expr.judge(Eq.is($.i, $.i), {}))).toBe(true)
    expect(Verdict.isTrue(Expr.judge(Eq.is($.f, $.f), {}))).toBe(true)
    expect(Expr.residualize(Eq.is($.i, $.i), {}).node).toEqual({ _tag: 'Lit', value: true })
    expect(Expr.residualize(Eq.is($.f, $.f), {}).node).toEqual({ _tag: 'Lit', value: true })
    expect(Expr.residualize(Eq.in($.i, []), {}).node).toEqual({ _tag: 'Lit', value: false })
  })

  it('Abstract stays Unknown on Match with a NUL literal or arbitrary string subject', () => {
    const litNul = Expr.matchOrElse(Expr.lit<string>('a\u0000'), { a: true }, true)
    expect(Verdict.isUnknown(Abstract.checkInvariant(Row, litNul))).toBe(true)

    const strMatch = Expr.matchOrElse($.s, { a: true }, true)
    expect(Verdict.isUnknown(Abstract.checkInvariant(Row, strMatch))).toBe(true)

    expect(Verdict.isUnknown(Abstract.checkInvariant(Row, Eq.is($.n, $.n)))).toBe(true)
    expect(Verdict.isTrue(Abstract.checkInvariant(Row, Eq.is($.i, $.i)))).toBe(true)
    expect(Verdict.isTrue(Abstract.checkInvariant(Row, Eq.is($.f, $.f)))).toBe(true)
  })

  it('Prove stays Unknown on Match over Schema.String and proves it over Text.schema', async () => {
    const strMatch = Expr.matchOrElse($.s, { a: true }, true)
    const strProof = await Effect.runPromise(Prove.invariant(Row, strMatch))
    expect(Verdict.isTrue(strProof)).toBe(false)
    expect(Verdict.isFalse(strProof)).toBe(false)

    const textMatch = Expr.matchOrElse($.t, { a: true }, true)
    const textProof = await Effect.runPromise(Prove.invariant(Row, textMatch))
    expect(Verdict.isTrue(textProof)).toBe(true)
  }, 30_000)
})
