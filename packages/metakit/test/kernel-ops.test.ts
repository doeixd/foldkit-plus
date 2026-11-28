/**
 * The operations step 1 adds: SQL's `=` and `in` with their nulls, the ASCII
 * fold, the code-point order of text, the trim every database agrees on, and
 * `coalesce`, over the awkward values, in evaluation, partial evaluation, the
 * checker and the solver.
 */
import { Effect, Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Abstract, Bool, Eq, Expr, Node, Null, Num, Ord, Path, Str, Verdict } from 'metakit'
import * as Prove from 'metakit/prove'

const Row = Schema.Struct({
  n: Schema.NullOr(Schema.Int),
  m: Schema.NullOr(Schema.Int),
  x: Schema.NullOr(Schema.Number),
  s: Schema.NullOr(Schema.String),
  t: Schema.NullOr(Schema.String),
})
type Row = typeof Row.Type
const $ = Path.forSchema(Row)
const empty: Row = { n: null, m: null, x: null, s: null, t: null }
const at = (fields: Partial<Row>): Row => ({ ...empty, ...fields })

const answer = (expr: Expr.Expr<Row, unknown>, row: Row): unknown =>
  Result.match(Expr.evalResult(expr, row), {
    onSuccess: value => value,
    onFailure: refusal => `refused: ${refusal.reason}`,
  })

describe('evaluation', () => {
  it.each<readonly [string, Expr.Expr<Row, unknown>, Partial<Row>, unknown]>([
    ['equals of two values', Eq.equals($.n, $.m), { n: 1, m: 1 }, true],
    ['equals of two others', Eq.equals($.n, $.m), { n: 1, m: 2 }, false],
    ['equals with null on the left', Eq.equals($.n, $.m), { m: 1 }, null],
    ['equals with null on the right', Eq.equals($.n, $.m), { n: 1 }, null],
    ['equals of two nulls', Eq.equals($.n, $.m), {}, null],
    ['equals of NaN with itself', Eq.equals($.x, $.x), { x: NaN }, 'refused: non-finite'],
    ['equals of NaN beside null', Eq.equals($.x, $.n), { x: NaN }, 'refused: non-finite'],
    ['among, a NaN value', Eq.among($.x, [1, 2]), { x: NaN }, 'refused: non-finite'],
    ['among, a NaN candidate', Eq.among($.n, [1, NaN]), { n: 1 }, 'refused: non-finite'],
    ['among, a NaN candidate of null', Eq.among($.n, [NaN]), {}, 'refused: non-finite'],
    [
      'equals of text holding a NUL beside null',
      Eq.equals($.s, $.t),
      { s: 'a\u0000' },
      'refused: unportable',
    ],
    [
      'equals of text holding a NUL',
      Eq.equals($.s, $.t),
      { s: 'a\u0000', t: 'b' },
      'refused: unportable',
    ],
    ['among, a match', Eq.among($.n, [1, 2]), { n: 2 }, true],
    ['among, no match', Eq.among($.n, [1, 2]), { n: 3 }, false],
    ['among, a null value', Eq.among($.n, [1, 2]), {}, null],
    ['among, no match beside a null', Eq.among($.n, [1, null]), { n: 3 }, null],
    ['among, a match beside a null', Eq.among($.n, [1, null]), { n: 1 }, true],
    ['among nothing', Eq.among($.n, []), { n: 1 }, false],
    ['among nothing, of null', Eq.among($.n, []), {}, false],
    ['among nothing, of NaN', Eq.among($.x, []), { x: NaN }, false],
    [
      'among, a candidate holding a NUL',
      Eq.among($.s, ['a\u0000']),
      { s: 'a' },
      'refused: unportable',
    ],
    ['lowerAscii folds A to Z', Str.lowerAscii($.s), { s: 'ABC xyZ' }, 'abc xyz'],
    ['lowerAscii keeps what is not ASCII', Str.lowerAscii($.s), { s: 'ÉİΣß' }, 'ÉİΣß'],
    ['lowerAscii of null', Str.lowerAscii($.s), {}, null],
    ['lowerAscii of a NUL', Str.lowerAscii($.s), { s: '\u0000' }, 'refused: unportable'],
    ['trim of space, tab, LF, CR', Str.trim($.s), { s: ' \t\r\nab c\n ' }, 'ab c'],
    ['trim keeps a no-break space', Str.trim($.s), { s: ' a　' }, ' a　'],
    ['trim of all white space', Str.trim($.s), { s: ' \t ' }, ''],
    ['trim of the empty text', Str.trim($.s), { s: '' }, ''],
    ['trim of null', Str.trim($.s), {}, null],
    ['lt by code point, not UTF-16 unit', Str.lt($.s, $.t), { s: '￿', t: '😀' }, true],
    ['lt of upper and lower case', Str.lt($.s, $.t), { s: 'B', t: 'a' }, true],
    ['lt of a prefix', Str.lt($.s, $.t), { s: 'ab', t: 'abc' }, true],
    ['lt of equal text', Str.lt($.s, $.t), { s: 'ab', t: 'ab' }, false],
    ['lte of equal text', Str.lte($.s, $.t), { s: 'ab', t: 'ab' }, true],
    ['gt of the empty text', Str.gt($.s, $.t), { s: 'a', t: '' }, true],
    ['gte with null', Str.gte($.s, $.t), { s: 'a' }, null],
    ['gte with a NUL', Str.gte($.s, $.t), { s: 'a', t: '\u0000' }, 'refused: unportable'],
    ['coalesce of a value', Null.coalesce($.n, $.m), { n: 1, m: 2 }, 1],
    ['coalesce of null', Null.coalesce($.n, $.m), { m: 2 }, 2],
    ['coalesce of two nulls', Null.coalesce($.n, $.m), {}, null],
    [
      'coalesce looks past a fallback that is refused',
      Null.coalesce($.n, Num.add($.m, Number.MAX_SAFE_INTEGER)),
      { n: 1, m: 1 },
      1,
    ],
    [
      'coalesce gives a fallback that is refused',
      Null.coalesce($.n, Num.add($.m, Number.MAX_SAFE_INTEGER)),
      { m: 1 },
      'refused: unsafe-integer',
    ],
  ])('%s', (_, expr, fields, expected) => {
    expect(answer(expr, at(fields))).toEqual(expected)
  })

  it('an absent key reads as null', () => {
    expect(Expr.evaluate(Null.coalesce($.n, 7), {} as unknown as Row)).toBe(7)
  })
})

describe('partial evaluation', () => {
  it.each<readonly [string, Expr.Expr<Row, unknown>, Node.Node]>([
    ['coalesce(x, null)', Null.coalesce($.s, null), $.s.node],
    ['coalesce(x, x)', Null.coalesce($.s, $.s), $.s.node],
    ['lowerAscii twice', Str.lowerAscii(Str.lowerAscii($.s)), Str.lowerAscii($.s).node],
    ['trim twice', Str.trim(Str.trim($.s)), Str.trim($.s).node],
  ])('%s shrinks', (_, expr, residual) => {
    expect(Expr.residualize(expr, {}).node).toEqual(residual)
  })

  it('among one candidate is equals of it', () => {
    expect(Expr.residualize(Eq.among($.n, [3]), {}).node).toEqual(Eq.equals($.n, 3).node)
  })

  it('a known value is folded through every new operation', () => {
    const known = { s: ' Ab ', t: 'b', n: null, m: 2 }
    expect(Expr.residualize(Str.lowerAscii(Str.trim($.s)), known).node).toEqual(
      Node.Lit({ value: 'ab' }),
    )
    expect(Expr.residualize(Null.coalesce($.n, $.m), known).node).toEqual(Node.Lit({ value: 2 }))
    expect(Expr.judge(Str.lt($.t, 'c'), known)._tag).toBe('True')
  })
})

describe('the checker', () => {
  const Strict = Schema.Struct({ n: Schema.Int, m: Schema.Int, k: Schema.Literals(['a', 'b']) })
  const s = Path.forSchema(Strict)

  it('decides equals of values as Eq.is, and not of what may be null', () => {
    expect(Verdict.isTrue(Abstract.checkInvariant(Strict, Eq.equals(s.n, s.n)))).toBe(true)
    expect(Verdict.isTrue(Abstract.checkInvariant(Row, Eq.equals($.n, $.n)))).toBe(false)
    expect(Verdict.isFalse(Abstract.checkInvariant(Row, Eq.equals($.n, $.n)))).toBe(false)
  })

  it('bounds a value among numbers once a rule says it is', () => {
    const Ranked = Strict.pipe(Expr.refine(r => Eq.among(r.n, [1, 2, 3])))
    const r = Path.forSchema(Ranked)
    expect(Verdict.isTrue(Abstract.checkInvariant(Ranked, Ord.lte(r.n, 3)))).toBe(true)
  })

  it('takes coalesce of a nullable number and a value to have a value', () => {
    const goal = Null.isNotNull(Null.coalesce($.n, 0))
    expect(Verdict.isTrue(Abstract.checkInvariant(Row, goal))).toBe(true)
    expect(
      Verdict.isTrue(Abstract.checkInvariant(Row, Null.isNotNull(Null.coalesce($.n, $.m)))),
    ).toBe(false)
  })

  it('orders literal text, and text that holds no NUL at itself', () => {
    expect(Verdict.isTrue(Abstract.checkInvariant(Strict, Str.lte(s.k, s.k)))).toBe(true)
    expect(Verdict.isFalse(Abstract.checkInvariant(Strict, Str.lt(s.k, s.k)))).toBe(true)
    expect(Verdict.isTrue(Abstract.checkInvariant(Row, Str.lte($.s, $.s)))).toBe(false)
  })
})

describe('the solver', () => {
  const Counted = Schema.Struct({
    n: Schema.NullOr(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
    k: Schema.Literals(['A', 'b']),
  })
  const c = Path.forSchema(Counted)
  const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect)

  it('proves through coalesce, equals, among and literal text', async () => {
    const goals = [
      Ord.gte(Null.coalesce(c.n, 0), 0),
      Expr.implies(Expr.all(Null.isNotNull(c.n), Eq.equals(c.n, 3)), Eq.among(c.n, [3, 4])),
      Expr.implies(Eq.is(c.k, 'A'), Eq.is(Str.lowerAscii(c.k), 'a')),
      Expr.implies(Eq.is(c.k, 'A'), Str.lt(c.k, 'a')),
    ]
    for (const goal of goals) {
      expect(Verdict.isTrue(await run(Prove.invariant(Counted, goal)))).toBe(true)
    }
  }, 30_000)

  it('refutes what does not hold, with a witness that replays', async () => {
    // A null value is null among anything, and so is no match beside a null candidate.
    expect(Verdict.isFalse(await run(Prove.invariant(Counted, Eq.among(c.n, [1, null]))))).toBe(
      true,
    )
    const Whole = Schema.Struct({ n: Schema.Int })
    const unmatched = Expr.implies(
      Ord.gt(Path.forSchema(Whole).n, 1),
      Bool.not(Eq.among(Path.forSchema(Whole).n, [1, null])),
    )
    expect(Verdict.isFalse(await run(Prove.invariant(Whole, unmatched)))).toBe(true)
    const nullable = Expr.implies(Eq.equals(c.n, 3), Eq.among(c.n, [3, 4]))
    expect(Verdict.isFalse(await run(Prove.invariant(Counted, nullable)))).toBe(true)
  }, 30_000)
})
