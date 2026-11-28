import { Option, Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Arr, Bool, Eq, Expr, Node, Null, Num, Ord, Path, Str, Verdict } from '@doeixd/metakit'
import { call } from '@doeixd/metakit/build'
import * as Operation from '@doeixd/metakit/operation'

const nulText = 'x\u0000'
const refusedNumber = Num.add(Number.MAX_SAFE_INTEGER, 1)
const refusedBoolean = Ord.lt(Number.NaN, 0)
const refusedText = Str.concat(nulText, '')
const Sample = Schema.Union([Schema.Number, Schema.String, Schema.Null])
const { left, right } = Path.forEnv({ left: Sample, right: Sample })

describe('Concrete value', () => {
  it.each([
    { kind: 'number', value: 42 },
    { kind: 'boolean', value: true },
    { kind: 'string', value: 'text' },
    { kind: 'array', value: [1, 2] },
    { kind: 'plain object', value: { count: 2 } },
  ])('returns a concrete $kind', ({ value }) => {
    expect(Expr.evalResult(Expr.lit(value), {})).toEqual(Result.succeed(value))
  })

  it.each([
    ['a bigint', () => Expr.lit(1n)],
    ['a symbol', () => Expr.lit(Symbol('s'))],
    ['a list holding a bigint', () => Expr.lit([1, 2n])],
  ])(
    'limits concrete values to numbers, booleans, strings, arrays and plain objects: %s literal throws',
    (_, build) => {
      expect(build).toThrow('[metakit] a literal must be')
    },
  )
})

describe('null — absence', () => {
  const { value } = Path.forSchema(Schema.Struct({ value: Schema.optional(Schema.Number) }))
  const { option } = Path.forEnv({ option: Schema.Option(Schema.Number) })

  it('returns null for absence, including Option.none() and missing/undefined optional keys', () => {
    expect(Expr.evalResult(Expr.lit(null), {})).toEqual(Result.succeed(null))
    expect(Expr.evaluate(option, { option: Option.none() })).toBe(null)
    expect(Expr.evaluate(value, {})).toBe(null)
    expect(Expr.evaluate(value, { value: undefined })).toBe(null)
  })
})

describe('Refusal — evaluation declined to answer', () => {
  const foreign = Operation.define({
    id: 'claims.refuses',
    version: 1,
    args: [Schema.Number],
    returns: Schema.Number,
    nulls: 'strict',
  })
  const implementations = Operation.implementations(
    'memory',
    Operation.implement(foreign, () => {
      throw new Error('declined')
    }),
  )

  it.each([
    { reason: 'unsafe-integer', expr: refusedNumber },
    { reason: 'non-finite', expr: refusedBoolean },
    { reason: 'ill-typed', expr: call(Str.lenOp, [42]) },
    { reason: 'unmatched', expr: Expr.match(Expr.lit<string>('no'), { yes: true }) },
    { reason: 'unportable', expr: refusedText },
    { reason: 'unsupported', expr: foreign(1) },
    { reason: 'failed', expr: foreign(1), options: { foreign: implementations } },
  ])('declines to answer with a $reason Refusal', ({ reason, expr, options }) => {
    expect(Expr.evalResult(expr, {}, options)).toMatchObject({ failure: { reason } })
  })
})

describe('Unknown — static/partial readers only', () => {
  const { flag } = Path.forSchema(
    Schema.Struct({ flag: Schema.optional(Schema.NullOr(Schema.Boolean)) }),
  )
  const predicate = Bool.not(flag)

  it('returns Unknown for insufficient information to decide', () => {
    expect(Verdict.isUnknown(Expr.judge(predicate, {}))).toBe(true)
    expect(Verdict.isTrue(Expr.judge(predicate, { flag: false }))).toBe(true)
    expect(Verdict.isFalse(Expr.judge(predicate, { flag: true }))).toBe(true)
  })

  it('Unknown is never null and never a concrete value', () => {
    const unknown = Expr.judge(predicate, {})
    expect(Verdict.isUnknown(unknown)).toBe(true)
    for (const env of [{}, { flag: null }, { flag: true }, { flag: false }]) {
      expect(Expr.evaluate(predicate, env)).not.toEqual(unknown)
    }
    expect(Expr.evalResult(predicate, {})).toEqual(Result.succeed(null))
    expect(Verdict.isFalse(Expr.judge(predicate, { flag: null }))).toBe(true)
  })
})

describe('Refusal decides before null', () => {
  it('returns an operand Refusal even if another operand is null', () => {
    const expected = Expr.evalResult(refusedNumber, {})
    expect(expected).toMatchObject({ failure: { reason: 'unsafe-integer', at: 'num.add' } })
    expect(Expr.evalResult(Num.mul(null, refusedNumber), {})).toEqual(expected)
    expect(Expr.evalResult(Num.mul(refusedNumber, null), {})).toEqual(expected)
  })

  it.each([
    {
      operator: 'ord.lt',
      evaluate: () => Expr.evalResult(Ord.lt(null, NaN), {}),
      reason: 'non-finite',
    },
    {
      operator: 'eq.equals',
      evaluate: () => Expr.evalResult(Eq.equals(NaN, null), {}),
      reason: 'non-finite',
    },
    {
      operator: 'str.concat',
      evaluate: () => Expr.evalResult(Str.concat(null, nulText), {}),
      reason: 'unportable',
    },
    {
      operator: 'eq.equals',
      evaluate: () => Expr.evalResult(Eq.equals(nulText, null), {}),
      reason: 'unportable',
    },
  ])(
    'returns a refusal triggered by the $operator screen before null',
    ({ operator, evaluate, reason }) => {
      expect(evaluate()).toMatchObject({ failure: { reason, at: operator } })
    },
  )
})

describe('Null propagation', () => {
  it.each([
    { operator: 'num.mul', evaluate: () => Expr.evalResult(Num.mul(null, 2), {}) },
    { operator: 'num.mul', evaluate: () => Expr.evalResult(Num.mul(2, null), {}) },
    { operator: 'ord.lt', evaluate: () => Expr.evalResult(Ord.lt(null, 2), {}) },
    { operator: 'eq.equals', evaluate: () => Expr.evalResult(Eq.equals(2, null), {}) },
  ])('$operator returns null with a null operand and no refusal ($#)', ({ evaluate }) => {
    expect(evaluate()).toEqual(Result.succeed(null))
  })
})

describe('Own-null operators handle null explicitly', () => {
  it.each([
    { a: true, b: null, and: null, or: true },
    { a: false, b: null, and: false, or: null },
    { a: null, b: null, and: null, or: null },
  ])('uses Kleene three-valued logic for bool.and and bool.or ($a, $b)', ({ a, b, and, or }) => {
    expect(Expr.evaluate(Bool.and(a, b), {})).toBe(and)
    expect(Expr.evaluate(Bool.and(b, a), {})).toBe(and)
    expect(Expr.evaluate(Bool.or(a, b), {})).toBe(or)
    expect(Expr.evaluate(Bool.or(b, a), {})).toBe(or)
  })

  it('uses null-safe equality in eq.is and eq.isNot', () => {
    expect(Expr.evaluate(Eq.is(null, null), {})).toBe(true)
    expect(Expr.evaluate(Eq.is(1, null), {})).toBe(false)
    expect(Expr.evaluate(Eq.isNot(null, null), {})).toBe(false)
    expect(Expr.evaluate(Eq.isNot(1, null), {})).toBe(true)
  })

  it('handles null explicitly in null.isNull and null.coalesce', () => {
    expect(Expr.evaluate(Null.isNull(null), {})).toBe(true)
    expect(Expr.evaluate(Null.isNull(0), {})).toBe(false)
    expect(Expr.evaluate(Null.coalesce(Expr.lit<number | null>(null), 7), {})).toBe(7)
  })

  it('handles null explicitly in eq.in and eq.among (SQL-compatible membership)', () => {
    const { needle } = Path.forEnv({ needle: Schema.NullOr(Schema.Number) })
    expect(Expr.evaluate(Eq.in(needle, [null, 2]), { needle: null })).toBe(true)
    expect(Expr.evaluate(Eq.in(needle, [2]), { needle: null })).toBe(false)
    expect(Expr.evaluate(Eq.among(needle, [2]), { needle: null })).toBe(null)
    expect(Expr.evaluate(Eq.among(needle, []), { needle: null })).toBe(false)
    expect(Expr.evaluate(Eq.among(needle, [2, null]), { needle: 2 })).toBe(true)
    expect(Expr.evaluate(Eq.among(needle, [2, null]), { needle: 1 })).toBe(null)
  })

  it.each([
    {
      operator: 'bool.and',
      expr: Bool.and(false, refusedBoolean),
      reason: 'non-finite',
      at: 'ord.lt',
    },
    {
      operator: 'bool.or',
      expr: Bool.or(refusedBoolean, true),
      reason: 'non-finite',
      at: 'ord.lt',
    },
    {
      operator: 'eq.is',
      expr: Eq.is(refusedNumber, null),
      reason: 'unsafe-integer',
      at: 'num.add',
    },
    {
      operator: 'eq.isNot',
      expr: Eq.isNot(refusedNumber, null),
      reason: 'unsafe-integer',
      at: 'num.add',
    },
    {
      operator: 'null.isNull',
      expr: Null.isNull(refusedNumber),
      reason: 'unsafe-integer',
      at: 'num.add',
    },
    { operator: 'eq.in', expr: Eq.in(refusedNumber, [1]), reason: 'unsafe-integer', at: 'num.add' },
    {
      operator: 'eq.among',
      expr: Eq.among(refusedNumber, []),
      reason: 'unsafe-integer',
      at: 'num.add',
    },
  ])('$operator still propagates refusals', ({ expr, reason, at }) => {
    expect(Expr.evalResult(expr, {})).toMatchObject({ failure: { reason, at } })
  })

  it('coalesce(1, <refused>) is 1, and a needed fallback can refuse', () => {
    expect(Expr.evaluate(Null.coalesce(1, refusedNumber), {})).toBe(1)
    const failure = Expr.evalResult(refusedNumber, {})
    expect(Result.isFailure(failure)).toBe(true)
    expect(
      Expr.evalResult(Null.coalesce(Expr.lit<number | null>(null), refusedNumber), {}),
    ).toEqual(failure)
    expect(Expr.evalResult(Null.coalesce(refusedNumber, 1), {})).toEqual(failure)
  })

  it('null.coalesce answers its first operand where it has a value, whatever the fallback is', () => {
    const fallback = Expr.opaque({}, () => 99)
    const { value } = Path.forEnv({ value: Schema.NullOr(Schema.Number) })
    const coalesced = Null.coalesce(value, fallback)
    expect(Expr.evaluate(coalesced, { value: 7 })).toBe(7)
    expect(Expr.evaluate(coalesced, { value: null })).toBe(99)
  })

  const { items } = Path.forEnv({ items: Schema.Array(Schema.Number) })
  const any = Arr.any(items, item => Ord.gt(item, 0))
  const every = Arr.every(items, item => Ord.gt(item, 0))

  it.each([
    { order: 'refusal first', items: [NaN, 1] },
    { order: 'true first', items: [1, NaN] },
  ])('any settles true past a refused element ($order)', ({ items }) => {
    expect(Expr.evaluate(any, { items })).toBe(true)
    expect(Expr.evalResult(any, { items: [NaN, -1] })).toMatchObject({
      failure: { reason: 'non-finite' },
    })
  })

  it.each([
    { order: 'refusal first', items: [NaN, -1] },
    { order: 'false first', items: [-1, NaN] },
  ])('every settles false past a refused element ($order)', ({ items }) => {
    expect(Expr.evaluate(every, { items })).toBe(false)
    expect(Expr.evalResult(every, { items: [NaN, 1] })).toMatchObject({
      failure: { reason: 'non-finite' },
    })
  })
})

describe('Short-circuiting', () => {
  it.each([
    { condition: true, taken: 'then' },
    { condition: false, taken: 'otherwise' },
  ])(
    'If evaluates cond first, then only $taken when cond is $condition',
    ({ condition, taken }) => {
      const reads: Array<string> = []
      const cond = Expr.opaque({}, () => {
        reads.push('cond')
        return condition
      })
      const branch = (name: string) =>
        Expr.opaque({}, () => {
          reads.push(name)
          return name
        })
      const expr = Expr.when(cond, { then: branch('then'), else: branch('otherwise') })
      expect(Expr.evaluate(expr, {})).toBe(taken)
      expect(reads).toEqual(['cond', taken])
    },
  )

  it('if cond is null the result is null', () => {
    const unseen = Expr.opaque({}, () => {
      throw new Error('evaluated a branch of If(null)')
    })
    expect(Expr.evalResult(Expr.when(null, { then: unseen, else: unseen }), {})).toEqual(
      Result.succeed(null),
    )
  })

  it('if cond is refused the refusal is returned', () => {
    const unseen = Expr.opaque({}, () => {
      throw new Error('evaluated a branch of a refused If')
    })
    const expr = Expr.when(refusedBoolean, { then: unseen, else: unseen })
    const refusal = Expr.evalResult(refusedBoolean, {})
    expect(Result.isFailure(refusal)).toBe(true)
    expect(Expr.evalResult(expr, {})).toEqual(refusal)
  })

  it.each([
    { subject: 'yes', taken: 'matching branch' },
    { subject: 'no', taken: 'otherwise' },
  ])('Match evaluates on once, then only the $taken', ({ subject, taken }) => {
    const reads: Array<string> = []
    const on = Expr.opaque({}, () => {
      reads.push('on')
      return subject
    })
    const branch = (name: string) =>
      Expr.opaque({}, () => {
        reads.push(name)
        return name
      })
    const expr = Expr.matchOrElse(
      on,
      { yes: branch('matching branch'), maybe: branch('other case') },
      branch('otherwise'),
    )
    expect(Expr.evaluate(expr, {})).toBe(taken)
    expect(reads).toEqual(['on', taken])
  })
})

describe('Predicates', () => {
  it('a rule or guard holds only when it evaluates to true', () => {
    const predicate = Ord.gt(1, 0)
    expect(Expr.evaluate(predicate, {})).toBe(true)
    expect(Expr.holds(predicate, {})).toBe(true)
  })

  it('false, null, and Refusal do not hold', () => {
    const no = Ord.gt(0, 1)
    const absent = Ord.gt(null, 1)
    expect(Expr.evalResult(no, {})).toEqual(Result.succeed(false))
    expect(Expr.evalResult(absent, {})).toEqual(Result.succeed(null))
    expect(Result.isFailure(Expr.evalResult(refusedBoolean, {}))).toBe(true)
    for (const predicate of [no, absent, refusedBoolean]) {
      expect(Expr.holds(predicate, {})).toBe(false)
    }
  })
})

const equalities = [
  { operator: 'eq.is', expr: Eq.is(left, right), normalized: true },
  { operator: 'eq.isNot', expr: Eq.isNot(left, right), normalized: false },
  { operator: 'eq.equals', expr: Eq.equals(left, right), normalized: true },
]

describe('Text normalization', () => {
  it('compares strings after replacing lone UTF-16 surrogates with U+FFFD', () => {
    for (const lone of ['\uD800', '\uDC00']) {
      const replacement = '\uFFFD'
      for (const { expr, normalized } of equalities) {
        expect(Expr.evaluate(expr, { left: lone, right: replacement })).toBe(normalized)
      }
      expect(Expr.evaluate(Eq.in(lone, [replacement]), {})).toBe(true)
      expect(Expr.evaluate(Eq.among(replacement, [lone]), {})).toBe(true)
      expect(
        Expr.evaluate(Expr.matchOrElse(Expr.lit<string>(lone), { [replacement]: true }, false), {}),
      ).toBe(true)
      expect(Expr.evaluate(Str.lte(lone, replacement), {})).toBe(true)
      expect(Expr.evaluate(Str.gte(lone, replacement), {})).toBe(true)
      expect(Expr.evaluate(Str.lt(lone, replacement), {})).toBe(false)
      expect(Expr.evaluate(Str.gt(lone, replacement), {})).toBe(false)
    }
    expect(Expr.evaluate(Eq.is('🚀', '\uFFFD\uFFFD'), {})).toBe(false)
  })

  it.each(equalities)(
    '$operator refuses a NUL in any operand before null decides',
    ({ operator, expr }) => {
      for (const env of [
        { left: nulText, right: null },
        { left: null, right: nulText },
      ]) {
        expect(Expr.evalResult(expr, env)).toMatchObject({
          failure: { reason: 'unportable', at: operator },
        })
      }
    },
  )

  const { needle } = Path.forEnv({ needle: Schema.NullOr(Schema.String) })

  it.each([
    { operator: 'eq.in', member: Eq.in<typeof needle> },
    { operator: 'eq.among', member: Eq.among<typeof needle, ReadonlyArray<string | null>> },
  ])(
    '$operator refuses NUL in its needle or any candidate before null decides',
    ({ operator, member }) => {
      for (const { value, candidates } of [
        { value: nulText, candidates: [null] },
        { value: null, candidates: ['ok', nulText] },
        { value: 'ok', candidates: ['ok', nulText] },
      ]) {
        expect(Expr.evalResult(member(needle, candidates), { needle: value })).toMatchObject({
          failure: { reason: 'unportable', at: operator },
        })
      }
    },
  )

  it.each([
    ['a null list is null', () => call(Eq.amongOp, [nulText, null]), null],
    ['no candidate is false', () => Eq.among(nulText, []), false],
  ])(
    'one exception to both screens: eq.among of a NUL needle against %s, as SQL writes FALSE for an empty IN',
    (_, build, expected) => {
      expect(Expr.evalResult(build(), {})).toEqual(Result.succeed(expected))
    },
  )
  it('Match refuses a NUL in its subject', () => {
    const expr = Expr.matchOrElse(Expr.lit<string>(nulText), { x: true }, false)
    expect(Expr.evalResult(expr, {})).toMatchObject({
      failure: { reason: 'unportable', at: 'match' },
    })
  })

  it('a Match case label holding a NUL is an error where the expression is built', () => {
    const subject = Expr.lit<string>(nulText)
    expect(() => Expr.match(subject, { [nulText]: true })).toThrow(/case label.*holds a NUL/)
    expect(() => Expr.matchOrElse(subject, { [nulText]: true }, false)).toThrow(
      /case label.*holds a NUL/,
    )
  })
})

describe('Numbers', () => {
  it.each([
    { expr: Num.add(Number.MAX_SAFE_INTEGER, 1), at: 'num.add' },
    { expr: Num.sub(Number.MIN_SAFE_INTEGER, 1), at: 'num.sub' },
    { expr: Num.mul(Number.MAX_SAFE_INTEGER, 2), at: 'num.mul' },
  ])('integer arithmetic refuses $at results outside the safe range', ({ expr, at }) => {
    expect(Expr.evalResult(expr, {})).toMatchObject({ failure: { reason: 'unsafe-integer', at } })
    expect(Expr.evaluate(Num.add(Number.MAX_SAFE_INTEGER - 1, 1), {})).toBe(Number.MAX_SAFE_INTEGER)
    expect(Expr.evaluate(Num.sub(Number.MIN_SAFE_INTEGER + 1, 1), {})).toBe(Number.MIN_SAFE_INTEGER)
  })

  const { a, b } = Path.forEnv({ a: Schema.NullOr(Schema.Number), b: Schema.NullOr(Schema.Number) })

  it.each([
    { operator: 'ord.lt', expr: Ord.lt(a, b) },
    { operator: 'ord.lte', expr: Ord.lte(a, b) },
    { operator: 'ord.gt', expr: Ord.gt(a, b) },
    { operator: 'ord.gte', expr: Ord.gte(a, b) },
  ])('$operator refuses NaN in either operand before null decides', ({ operator, expr }) => {
    for (const env of [
      { a: NaN, b: null },
      { a: null, b: NaN },
      { a: NaN, b: 1 },
      { a: 1, b: NaN },
    ]) {
      expect(Expr.evalResult(expr, env)).toMatchObject({
        failure: { reason: 'non-finite', at: operator },
      })
    }
  })

  it.each(equalities)(
    '$operator refuses NaN in either operand before null decides',
    ({ operator, expr }) => {
      for (const env of [
        { left: NaN, right: NaN },
        { left: NaN, right: null },
        { left: null, right: NaN },
        { left: NaN, right: 1 },
        { left: 1, right: NaN },
      ]) {
        expect(Expr.evalResult(expr, env)).toMatchObject({
          failure: { reason: 'non-finite', at: operator },
        })
      }
    },
  )

  it.each([
    { operator: 'eq.in', member: Eq.in<typeof a> },
    { operator: 'eq.among', member: Eq.among<typeof a, ReadonlyArray<number | null>> },
  ])(
    '$operator refuses NaN in its needle or any candidate before null decides',
    ({ operator, member }) => {
      for (const { value, candidates } of [
        { value: NaN, candidates: [null] },
        { value: null, candidates: [1, NaN] },
        { value: 1, candidates: [1, NaN] },
      ]) {
        expect(Expr.evalResult(member(a, candidates), { a: value, b: null })).toMatchObject({
          failure: { reason: 'non-finite', at: operator },
        })
      }
    },
  )

  it.each([
    ['a null list is null', () => call(Eq.amongOp, [NaN, null]), null],
    ['no candidate is false', () => Eq.among(NaN, []), false],
  ])(
    'one exception to both screens: eq.among of a NaN needle against %s, as SQL writes FALSE for an empty IN',
    (_, build, expected) => {
      expect(Expr.evalResult(build(), {})).toEqual(Result.succeed(expected))
    },
  )

  it('a -0 read from the environment reads as 0, as arithmetic results do', () => {
    expect(Expr.evaluate(a, { a: -0, b: null })).toBe(0)
    expect(Expr.evaluate(Num.neg(0), {})).toBe(0)
    expect(Expr.evaluate(Num.mul(-1, 0), {})).toBe(0)
  })
})
