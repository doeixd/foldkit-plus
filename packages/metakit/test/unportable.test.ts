/**
 * Text as a database holds it: a lone surrogate reads as U+FFFD and text is
 * compared by character, and every text and equality operation refuses text
 * holding a NUL, which Postgres cannot store.
 */
import { Effect, Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Abstract, Eq, Expr, Path, Str, Verdict } from '@doeixd/metakit'
import * as Prove from '@doeixd/metakit/prove'

const Row = Schema.Struct({ s: Schema.String, n: Schema.Int, st: Schema.Literals(['a', 'b']) })
const $ = Path.forSchema(Row)
const row = (s: string) => ({ s, n: 1, st: 'a' as const })

const refusalOf = (expr: Expr.Expr<typeof Row.Type, unknown>, s: string) =>
  Result.match(Expr.evalResult(expr, row(s)), {
    onSuccess: () => 'answered',
    onFailure: refusal => refusal.reason,
  })

describe('text is compared by character', () => {
  it.each([
    ['half of an astral character does not begin it', Str.startsWith($.s, '\uD83D'), '😀x', false],
    ['half of an astral character is not inside it', Str.contains($.s, '\uDE00'), '😀x', false],
    ['a lone surrogate reads as U+FFFD', Str.contains($.s, '�'), 'a\uDE00', true],
    ['a whole astral character begins it', Str.startsWith($.s, '😀'), '😀x', true],
    ['a lone surrogate is one character', Eq.is(Str.len($.s), 2), 'a\uD83D', true],
  ] as const)('%s', (_, expr, s, expected) => {
    expect(Expr.evaluate(expr, row(s))).toBe(expected)
  })
})

describe('text holding a NUL is refused', () => {
  it.each([
    ['eq.is', Eq.is($.s, 'x')],
    ['eq.is of itself', Eq.is($.s, $.s)],
    ['eq.isNot', Eq.isNot($.s, 'x')],
    ['eq.in', Eq.oneOf($.s, ['x', 'y'])],
    ['str.len', Str.len($.s)],
    ['str.startsWith', Str.startsWith($.s, '')],
    ['str.contains', Str.contains($.s, 'a')],
  ] as const)('by %s', (_, expr) => {
    expect(refusalOf(expr, 'a\u0000b')).toBe('unportable')
    expect(refusalOf(expr, 'ab')).toBe('answered')
  })

  it('by equality with null, which answers for any other text', () => {
    const Maybe = Schema.Struct({ s: Schema.NullOr(Schema.String) })
    const isNull = Eq.is(Path.forSchema(Maybe).s, null)
    expect(Result.isFailure(Expr.evalResult(isNull, { s: 'a\u0000' }))).toBe(true)
    expect(Expr.evaluate(isNull, { s: 'a' })).toBe(false)
  })

  it('in a candidate as in the value', () => {
    expect(refusalOf(Eq.oneOf($.s, ['x\u0000']), 'x')).toBe('unportable')
  })
})

describe('the readers do not answer for text that may hold a NUL', () => {
  it('partial evaluation keeps equality of text with itself', () => {
    expect(Expr.residualize(Eq.is($.s, $.s), {}).node._tag).toBe('Call')
    expect(Expr.residualize(Eq.oneOf($.s, []), {}).node._tag).toBe('Call')
    expect(Expr.residualize(Eq.is($.n, $.n), {}).node).toEqual({ _tag: 'Lit', value: true })
    expect(Expr.residualize(Eq.is($.st, $.st), {}).node).toEqual({ _tag: 'Lit', value: true })
  })

  it('the checker proves equality of a field with itself only where it holds no text', () => {
    expect(Verdict.isTrue(Abstract.checkInvariant(Row, Eq.is($.s, $.s)))).toBe(false)
    expect(Verdict.isTrue(Abstract.checkInvariant(Row, Eq.is($.n, $.n)))).toBe(true)
    expect(Verdict.isTrue(Abstract.checkInvariant(Row, Eq.is($.st, $.st)))).toBe(true)
  })

  it('the solver proves nothing of text that may hold a NUL, and finds no witness holding one', async () => {
    const proof = await Effect.runPromise(Prove.invariant(Row, Eq.is($.s, $.s)))
    expect(Verdict.isTrue(proof)).toBe(false)
    expect(Verdict.isFalse(proof)).toBe(false)
    const witness = await Effect.runPromise(Prove.invariant(Row, Eq.isNot($.s, 'x')))
    expect(Verdict.isFalse(witness)).toBe(true)
  }, 30_000)

  it('the checker takes text a rule it assumes did not refuse as holding none', () => {
    const Prefixed = Schema.Struct({ s: Schema.String }).pipe(
      Expr.refine(p => Str.startsWith(p.s, 'x')),
    )
    const p = Path.forSchema(Prefixed)
    expect(Verdict.isTrue(Abstract.checkInvariant(Prefixed, Eq.is(p.s, p.s)))).toBe(true)
    expect(Verdict.isTrue(Abstract.checkInvariant(Row, Eq.is($.s, $.s)))).toBe(false)
  })
})
