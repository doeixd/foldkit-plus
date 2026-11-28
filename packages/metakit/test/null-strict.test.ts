/**
 * Evaluation is null-strict and refuses what a double cannot answer, and
 * every rewrite of partial evaluation keeps that answer.
 */
import { Option, Result, Schema } from 'effect'
import { Arr, Bool, Eq, Expr, Node, Null, Num, Ord, Path, Str, Transition, Verdict } from 'metakit'
import { describe, expect, it } from 'vitest'

const Row = Schema.Struct({
  n: Schema.Int,
  m: Schema.Int,
  f: Schema.Finite,
  raw: Schema.Number,
  b: Schema.Boolean,
  c: Schema.Boolean,
  s: Schema.String,
  tags: Schema.Array(Schema.String),
  status: Schema.Literals(['open', 'frozen']),
})
type Row = typeof Row.Type
const $ = Path.from(Row)

/** A row as data arrives: untyped, so a field may hold what its type forbids. */
const row = (fields: Record<string, unknown>): Row =>
  JSON.parse(
    JSON.stringify({
      n: 3,
      m: 4,
      f: 0.5,
      raw: 1,
      b: true,
      c: false,
      s: 'ab',
      tags: [],
      status: 'open',
      ...fields,
    }),
  )

/** The outcome of evaluating: the value, or the reason it was refused. */
const outcome = <A>(expr: Expr.Expr<Row, A>, env: Row): unknown =>
  Result.match(Expr.evalResult(expr, env), {
    onSuccess: value => value,
    onFailure: refusal => `refused: ${refusal.reason}`,
  })

describe('null-strict evaluation', () => {
  it.each<[string, Expr.Expr<Row, unknown>, Record<string, unknown>, unknown]>([
    ['null + 1', Num.add($.n, 1), { n: null }, null],
    ['1 - null', Num.sub(1, $.n), { n: null }, null],
    ['null * 0', Num.mul($.n, 0), { n: null }, null],
    ['-null', Num.neg($.n), { n: null }, null],
    ['null < 5', Ord.lt($.n, 5), { n: null }, null],
    ['5 <= null', Ord.lte(5, $.n), { n: null }, null],
    ['null > 5', Ord.gt($.n, 5), { n: null }, null],
    ['null >= 5', Ord.gte($.n, 5), { n: null }, null],
    ['len(null)', Str.len($.s), { s: null }, null],
    ['startsWith(null, "")', Str.startsWith($.s, ''), { s: null }, null],
    ['contains(null, "")', Str.contains($.s, ''), { s: null }, null],
    ['count(null)', Arr.count($.tags), { tags: null }, null],
    ['isEmpty(null)', Arr.isEmpty($.tags), { tags: null }, null],
    ['not null', Bool.not($.b), { b: null }, null],
    ['false and null', Bool.and($.c, $.b), { b: null }, false],
    ['null and false', Bool.and($.b, $.c), { b: null }, false],
    ['true and null', Bool.and($.b, $.c), { c: null }, null],
    ['true or null', Bool.or($.b, $.c), { c: null }, true],
    ['null or true', Bool.or($.c, $.b), { c: null }, true],
    ['false or null', Bool.or($.c, $.b), { b: null }, null],
    ['null is null', Eq.is($.n, $.m), { n: null, m: null }, true],
    ['null is 3', Eq.is($.n, 3), { n: null }, false],
    ['null is not 3', Eq.isNot($.n, 3), { n: null }, true],
    ['null in [3]', Eq.in($.n, [3]), { n: null }, false],
    ['isNull(null)', Null.isNull($.n), { n: null }, true],
    ['isNull(3)', Null.isNull($.n), {}, false],
    ['min(-1, null)', Num.min(-1, $.n), { n: null }, null],
    ['min(null, -1)', Num.min($.n, -1), { n: null }, null],
    ['max(null, 1)', Num.max($.n, 1), { n: null }, null],
    ['abs(null)', Num.abs($.n), { n: null }, null],
    ['if null', Expr.when($.b, { then: 1, else: 2 }), { b: null }, null],
    ['match null', Expr.match($.status, { open: 1, frozen: 2 }), { status: null }, null],
    ['match null with a fallback', Expr.matchOrElse($.status, { open: 1 }, 9), { status: null }, 9],
    ['isEmpty of a null string', Str.isEmpty($.s), { s: null }, false],
  ])('%s', (_, expr, fields, expected) => {
    expect(outcome(expr, row(fields))).toBe(expected)
  })

  it('reads an absent key as null', () => {
    const { n: _, ...rest } = row({})
    const absent: Row = JSON.parse(JSON.stringify(rest))
    expect(outcome($.n, absent)).toBeNull()
    expect(outcome(Ord.lte($.n, $.n), absent)).toBeNull()
    expect(outcome(Null.isNull($.n), absent)).toBe(true)
  })

  it.each<[string, Expr.Expr<Row, unknown>, Row, string]>([
    [
      'an integer sum past 2^53-1',
      Num.add($.n, 2),
      { ...row({}), n: 2 ** 53 - 1 },
      'unsafe-integer',
    ],
    [
      'an integer product past 2^53-1',
      Num.mul($.n, $.n),
      { ...row({}), n: 2 ** 40 },
      'unsafe-integer',
    ],
    [
      'the negation of the result',
      Bool.not(Ord.gt(Num.add($.n, 2), 0)),
      { ...row({}), n: 2 ** 53 - 1 },
      'unsafe-integer',
    ],
    [
      'an operand past the safe range',
      Num.add($.f, 0.5),
      { ...row({}), f: 2 ** 60 },
      'unsafe-integer',
    ],
    ['arithmetic over NaN', Num.add($.raw, 1), { ...row({}), raw: NaN }, 'non-finite'],
    ['an order over NaN', Ord.lte($.raw, $.raw), { ...row({}), raw: NaN }, 'non-finite'],
    ['arithmetic over text', Num.add($.n, 0), row({ n: 'a' }), 'ill-typed'],
    ['a truth value that is a number', Bool.and($.b, $.c), row({ b: 1, c: true }), 'ill-typed'],
    [
      'a condition that is a number',
      Expr.when($.b, { then: 1, else: 2 }),
      row({ b: 1 }),
      'ill-typed',
    ],
    ['a length of a number', Str.len($.s), row({ s: 5 }), 'ill-typed'],
    ['a count of text', Arr.count($.tags), row({ tags: 'x' }), 'ill-typed'],
    [
      'a value no case names',
      Expr.match($.status, { open: 1, frozen: 2 }),
      row({ status: 'gone' }),
      'unmatched',
    ],
  ])('refuses %s', (_, expr, env, reason) => {
    expect(outcome(expr, env)).toBe(`refused: ${reason}`)
    expect(() => Expr.eval(expr, env)).toThrow(Node.Refusal)
  })

  it('keeps a float sum a float and a safe integer sum exact', () => {
    expect(outcome(Num.add($.f, $.f), { ...row({}), f: 1.25 })).toBe(2.5)
    expect(outcome(Num.add($.f, $.f), { ...row({}), f: 1e300 })).toBe('refused: unsafe-integer')
    expect(outcome(Num.add($.n, 1), { ...row({}), n: 2 ** 53 - 2 })).toBe(2 ** 53 - 1)
    expect(Object.is(outcome(Num.mul($.n, 0), { ...row({}), n: -3 }), 0)).toBe(true)
  })

  it('lets neither false decide a conjunction nor true a disjunction over a refusal', () => {
    const refused = Ord.gt(Num.add($.n, 2), 0)
    const env = { ...row({}), n: 2 ** 53 - 1 }
    expect(outcome(Bool.and($.c, refused), env)).toBe('refused: unsafe-integer')
    expect(outcome(Bool.or($.b, refused), env)).toBe('refused: unsafe-integer')
    expect(outcome(Bool.and(refused, $.c), env)).toBe('refused: unsafe-integer')
    expect(outcome(Bool.and($.b, refused), env)).toBe('refused: unsafe-integer')
    // Over values that are not refused, false still decides a conjunction and true a disjunction.
    expect(outcome(Bool.and($.c, Ord.gt($.n, 0)), env)).toBe(false)
    expect(outcome(Bool.or($.b, Ord.gt($.n, 0)), env)).toBe(true)
  })

  it('holds a rule only where it is true', () => {
    const positive = Ord.gt($.n, 0)
    expect(Expr.holds(positive, row({}))).toBe(true)
    expect(Expr.holds(positive, row({ n: null }))).toBe(false)
    expect(Expr.holds(Bool.not(positive), row({ n: null }))).toBe(false)
    expect(Expr.holds(Ord.gt(Num.add($.n, 2), 0), { ...row({}), n: 2 ** 53 - 1 })).toBe(false)

    // A rule the evaluator cannot answer is null, and so is its negation.
    const unknowable = Expr.opaque<unknown, boolean>({ name: 'unknowable' }, () =>
      JSON.parse('null'),
    )
    const Checked = Schema.Struct({ n: Schema.Int }).pipe(Expr.refine(() => Bool.not(unknowable)))
    expect(Schema.is(Checked)({ n: 1 })).toBe(false)
    const Negative = Schema.Struct({ n: Schema.Int }).pipe(
      Expr.refine(s => Bool.not(Ord.gt(s.n, 0))),
    )
    expect(Schema.is(Negative)({ n: -1 })).toBe(true)
  })

  it('does not fire a transition whose guard is null, and refuses a refused write', () => {
    const State = Schema.Struct({ n: Schema.Int })
    const Bump = Transition.make({
      state: State,
      input: Schema.Struct({}),
      when: ({ state }) => Bool.not(Ord.lt(state.n, 0)),
      apply: ({ state }) => [Transition.set(state.n, Num.add(state.n, 2))],
    })
    expect(Transition.run(Bump, { n: 1 }, {})).toEqual(Result.succeed({ n: 3 }))
    expect(Result.isFailure(Transition.run(Bump, JSON.parse('{"n":null}'), {}))).toBe(true)
    const past = Transition.run(Bump, { n: 2 ** 53 - 1 }, {})
    expect(Result.isFailure(past) && past.failure.reason).toContain('past ±(2^53−1)')
  })
})

describe('partial evaluation keeps the answer of evaluation', () => {
  // Every value a field's Schema admits, and null, which an absent key reads as.
  const awkward: ReadonlyArray<Record<string, unknown>> = [
    {},
    { n: null },
    { n: 0 },
    { n: -3 },
    { n: 2 ** 53 - 1 },
    { n: -(2 ** 53 - 1) },
    { f: null },
    { f: 1e200 },
    { f: -0.25 },
    { raw: null },
    { raw: Number.NaN },
    { raw: Number.POSITIVE_INFINITY },
    { b: null },
    { b: false },
    { c: null },
    { s: null },
    { s: '' },
    { s: '🚀' },
    { tags: null },
    { tags: ['x'] },
  ]
  const untyped = Path.of<Row>()
  const laws: ReadonlyArray<readonly [string, Expr.Expr<Row, unknown>]> = [
    ['x + 0', Num.add($.n, 0)],
    ['0 + x', Num.add(0, $.n)],
    ['x - 0', Num.sub($.n, 0)],
    ['0 - x', Num.sub(0, $.n)],
    ['x - x', Num.sub($.n, $.n)],
    ['x * 1', Num.mul($.n, 1)],
    ['1 * x', Num.mul(1, $.f)],
    ['x * 0', Num.mul($.n, 0)],
    ['0 * x', Num.mul(0, $.f)],
    ['--x', Num.neg(Num.neg($.n))],
    ['(x + y) + 0', Num.add(Num.add($.n, $.n), 0)],
    ['raw + 0', Num.add($.raw, 0)],
    ['untyped + 0', Num.add(untyped.n, 0)],
    ['x <= x', Ord.lte($.n, $.n)],
    ['x >= x', Ord.gte($.n, $.n)],
    ['x < x', Ord.lt($.n, $.n)],
    ['x > x', Ord.gt($.n, $.n)],
    ['x is x', Eq.is($.n, $.n)],
    ['x is not x', Eq.isNot($.n, $.n)],
    ['(x + 2) is (x + 2)', Eq.is(Num.add($.n, 2), Num.add($.n, 2))],
    ['x and true', Bool.and($.b, true)],
    ['true and x', Bool.and(true, $.b)],
    ['x and false', Bool.and($.b, false)],
    ['x or false', Bool.or($.b, false)],
    ['x or true', Bool.or($.b, true)],
    ['x and x', Bool.and($.b, $.b)],
    ['x or x', Bool.or($.b, $.b)],
    ['not not x', Bool.not(Bool.not($.b))],
    ['untyped and true', Bool.and(untyped.b, true)],
    ['(x > 0) and true', Bool.and(Ord.gt($.n, 0), true)],
    ['startsWith(x, "")', Str.startsWith($.s, '')],
    ['contains(x, "")', Str.contains($.s, '')],
    ['x in []', Eq.in($.n, [])],
    ['(x + 2) in []', Eq.in(Num.add($.n, 2), [])],
    ['x in [3]', Eq.in($.n, [3])],
    ['if c then 1 else 1', Expr.when($.b, { then: 1, else: 1 })],
    ['if c then Infinity else -Infinity', Expr.when($.b, { then: Infinity, else: -Infinity })],
    ['isEmpty(tags)', Arr.isEmpty($.tags)],
    ['len(s) is 0', Str.isEmpty($.s)],
  ]

  it.each(laws)('%s', (_, expr) => {
    const residual = Expr.residualize(expr, {})
    for (const fields of awkward) {
      const env: Row = Object.assign(row({}), fields)
      expect(
        outcome(residual, env),
        `${Expr.show(residual)} over ${JSON.stringify(fields)}`,
      ).toEqual(outcome(expr, env))
    }
  })

  it('still shrinks where a law holds', () => {
    const shown = (expr: Expr.Expr<Row, unknown>) => Expr.show(Expr.residualize(expr, {}))
    expect(shown(Num.add($.n, 0))).toBe('n')
    expect(shown(Num.sub($.n, 0))).toBe('n')
    expect(shown(Num.mul(1, $.n))).toBe('n')
    // A finite number may be past the safe range, where `1 * f` is refused and `f` is not.
    expect(shown(Num.mul(1, $.f))).toBe('(1 * f)')
    expect(shown(Num.neg(Num.neg($.n)))).toBe('n')
    expect(shown(Bool.and($.b, true))).toBe('b')
    expect(shown(Bool.or(false, $.b))).toBe('b')
    expect(shown(Bool.and($.b, false))).toBe('false')
    expect(shown(Bool.or(true, $.b))).toBe('true')
    expect(shown(Bool.and($.b, $.b))).toBe('b')
    expect(shown(Bool.not(Bool.not($.b)))).toBe('b')
    expect(shown(Eq.is($.n, $.n))).toBe('true')
    expect(shown(Eq.isNot($.n, $.n))).toBe('false')
    expect(shown(Eq.in($.n, []))).toBe('false')
    expect(shown(Eq.in($.n, [3]))).toBe('(n == 3)')
  })

  it('judges a known null as not holding and a refusal as unknown', () => {
    expect(Verdict.isFalse(Expr.judge(Ord.gt($.n, 0), JSON.parse('{"n":null}')))).toBe(true)
    const refused = Expr.judge(Ord.gt(Num.add($.n, 2), 0), { n: 2 ** 53 - 1 })
    expect(Verdict.isUnknown(refused) && refused.reason).toContain('evaluation refused')
    // Its own kind, so a reader can tell a refusal from a solver that cannot lower an operation.
    expect(Verdict.isUnknown(refused) && refused.obligation).toEqual(
      Option.some({ kind: 'refused', detail: expect.any(String) }),
    )
    expect(Verdict.isUnknown(Expr.judge(Ord.lte($.n, $.n), {}))).toBe(true)
  })

  it('tells distinct literals apart', () => {
    const lit = (value: unknown) => Node.key(Node.Lit({ value }))
    expect(new Set([NaN, Infinity, -Infinity, null].map(lit)).size).toBe(4)
    expect(lit(new Set([1]))).not.toBe(lit(new Set([2])))
    expect(lit(() => 1)).not.toBe(lit(() => 1))
    expect(lit({ a: 1, b: [2] })).toBe(lit({ b: [2], a: 1 }))
    expect(lit(-0)).toBe(lit(0))
    expect(lit(undefined)).toBe(lit(null))
  })

  it('leaves a read of a partly supplied struct unknown', () => {
    const Model = Schema.Struct({
      user: Schema.Struct({ name: Schema.String, age: Schema.Int }),
      note: Schema.Struct({ text: Schema.optionalKey(Schema.String) }),
    })
    const { model } = Path.forEnv({ model: Model })
    const whole = { user: { name: 'x', age: 3 }, note: {} }
    const part = { model: { user: { name: 'x' } } }
    const tag = (expr: Expr.Expr<never, unknown>) => expr.node._tag
    expect(tag(Expr.residualize(model.user, part))).toBe('Path')
    expect(tag(Expr.residualize(model.user, { model: whole }))).toBe('Lit')
    expect(tag(Expr.residualize(model.note, { model: whole }))).toBe('Lit')
    expect(tag(Expr.residualize(model.user.name, part))).toBe('Lit')
    expect(tag(Expr.residualize(model, { model: { user: { name: 'x', age: 3 } } }))).toBe('Path')

    const adult = Expr.opaque<{ readonly model: typeof Model.Type }, boolean>(
      { name: 'adult', reads: [model.user] },
      env => env.model.user.age >= 18,
    )
    expect(Verdict.isUnknown(Expr.judge(adult, { model: { user: { name: 'x' } } }))).toBe(true)
    expect(
      Option.isSome(Expr.reads(Expr.residualize(adult, { model: { user: { name: 'x' } } }))),
    ).toBe(true)
  })
})
