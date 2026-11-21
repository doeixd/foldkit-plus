/**
 * The Tier 3 checker says `True` only of what evaluates to true in every
 * environment its Schemas admit. Each case here pairs a goal the checker must
 * not prove with an environment in which it is not true.
 */
import { Result, Schema } from 'effect'
import { Abstract, Bool, Eq, Expr, Null, Num, Ord, Path, Str, Transition, Verdict } from 'metakit'
import { describe, expect, it } from 'vitest'

/** `goal` is not proved, and `env`, which the Schema admits, is why. */
const unproved = <S extends Schema.Top>(
  schema: S,
  goal: Expr.Expr<S['Type'], boolean | null>,
  env: S['Type'],
): void => {
  expect(Schema.is(schema)(env), 'the Schema admits the environment').toBe(true)
  expect(Expr.holds(goal, env), 'the goal does not hold of it').toBe(false)
  expect(Verdict.isTrue(Abstract.checkInvariant(schema, goal))).toBe(false)
}

const proved = <S extends Schema.Top>(
  schema: S,
  goal: Expr.Expr<S['Type'], boolean | null>,
): void => {
  expect(Abstract.checkInvariant(schema, goal)._tag).toBe('True')
}

const Count = Schema.Struct({ x: Schema.Int })
const $ = Path.from(Count)

describe('a conditional', () => {
  const flipped = Expr.when(Ord.gt($.x, 0), { then: false, else: true })

  it('is not decided from one of its branches under a negation', () => {
    unproved(Count, Bool.not(flipped), { x: -1 })
    unproved(Count, flipped, { x: 1 })
  })

  it('does not lose a branch where it is itself a condition', () => {
    unproved(Count, Ord.lte(Expr.when(flipped, { then: 100, else: 0 }), 0), { x: -1 })
  })

  it('does not make an implication from it vacuous', () => {
    const cond = Expr.when(Ord.gt($.x, 0), { then: Ord.lt($.x, 0), else: Ord.lte($.x, 0) })
    unproved(Count, Expr.implies(cond, Ord.gt($.x, 5)), { x: 0 })
  })

  it('is still decided where both branches agree', () => {
    proved(Count, Ord.gte(Num.abs(Num.neg($.x)), 0))
    proved(Count, Expr.when(Ord.gt($.x, 0), { then: Ord.gte($.x, 1), else: Ord.lte($.x, 0) }))
    const never = Bool.not(
      Expr.when(Ord.gt($.x, 0), { then: Ord.lt($.x, 0), else: Ord.gt($.x, 0) }),
    )
    proved(Count, never)
    // A proof by refuting what is negated still says which tier gave it.
    expect(Abstract.checkInvariant(Count, never)).toMatchObject({
      evidence: { value: { tier: 'zone' } },
    })
  })

  it('answers False only where every case is false', () => {
    const Status = Schema.Struct({ s: Schema.Literals(['a', 'b']) })
    const s = Path.from(Status)
    const small = Ord.lte(Expr.match(s.s, { a: 1, b: 5 }), 2)
    expect(Abstract.checkInvariant(Status, small)._tag).toBe('Unknown')
    expect(Abstract.checkInvariant(Status, Bool.not(small))._tag).toBe('Unknown')
    expect(Abstract.checkInvariant(Status, Ord.gt(Expr.match(s.s, { a: 1, b: 5 }), 9))._tag).toBe(
      'False',
    )
  })
})

describe('a transition', () => {
  const NonNegative = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))

  it('is not proved where a write replaces the struct a rule reads', () => {
    const State = Schema.Struct({ account: Schema.Struct({ balance: NonNegative }), n: Schema.Int })
    const Replace = Transition.make({
      state: State,
      input: Schema.Struct({ next: Schema.Struct({ balance: Schema.Int }) }),
      apply: ({ state, input }) => [Transition.set(state.account, input.next)],
    })
    const after = Transition.run(
      Replace,
      { account: { balance: 1 }, n: 0 },
      { next: { balance: -5 } },
    )
    expect(Result.isSuccess(after) && Schema.is(State)(after.success)).toBe(false)
    expect(Verdict.isTrue(Abstract.checkTransition(State, Replace))).toBe(false)

    const Kept = Transition.make({
      state: State,
      input: Schema.Struct({ next: Schema.Struct({ balance: NonNegative }) }),
      apply: ({ state, input }) => [Transition.set(state.account, input.next)],
    })
    expect(Abstract.checkTransition(State, Kept)._tag).toBe('True')
  })

  it('is not proved where a write replaces the whole state', () => {
    const State = Schema.Struct({ balance: NonNegative })
    const Replace = Transition.make({
      state: State,
      input: Schema.Struct({ next: Schema.Struct({ balance: Schema.Int }) }),
      apply: ({ state, input }) => [Transition.set(state, input.next)],
    })
    expect(Verdict.isTrue(Abstract.checkTransition(State, Replace))).toBe(false)
  })

  it('reads a rule of a replaced struct off the struct that replaces it', () => {
    const Span = Schema.Struct({ a: Schema.Int, b: Schema.Int })
    const Ordered = Span.pipe(Expr.refine(s => Ord.lte(s.a, s.b)))
    const State = Schema.Struct({ span: Ordered })
    const replace = <I extends Schema.Top>(next: I) =>
      Abstract.checkTransition(
        State,
        Transition.make({
          state: State,
          input: Schema.Struct({ next }),
          apply: ({ state }) => [
            Transition.set(state.span, Path.make<unknown, typeof Ordered.Type>(['input', 'next'])),
          ],
        }),
      )._tag
    expect(replace(Span)).toBe('Unknown')
    expect(replace(Ordered)).toBe('True')
  })

  it('holds each field of a replaced struct to what its Schema states, rule or not', () => {
    const State = Schema.Struct({ held: Schema.Struct({ n: Schema.NullOr(NonNegative) }) })
    const replace = <I extends Schema.Top>(next: I) =>
      Abstract.checkTransition(
        State,
        Transition.make({
          state: State,
          input: Schema.Struct({ next }),
          apply: ({ state }) => [
            Transition.set(
              state.held,
              Path.make<unknown, { readonly n: number | null }>(['input', 'next']),
            ),
          ],
        }),
      )._tag
    expect(replace(Schema.Struct({ n: Schema.NullOr(Schema.Int) }))).toBe('Unknown')
    expect(replace(Schema.Struct({ n: Schema.NullOr(NonNegative) }))).toBe('True')
  })

  it('proves every fact its Schema states of a written field, not only its rules', () => {
    const State = Schema.Struct({
      n: Schema.NullOr(NonNegative),
      m: NonNegative,
      k: Schema.Int,
      status: Schema.Literals(['a', 'b']),
      label: Schema.String,
    })
    const Input = Schema.Struct({
      text: Schema.String,
      status: Schema.Literals(['a', 'b']),
      wide: Schema.Literals(['a', 'b', 'c']),
      maybe: Schema.NullOr(Schema.Int),
    })
    type Env = Transition.TransitionEnv<typeof State.Type, typeof Input.Type>
    const writing = (
      apply: (env: {
        readonly state: Path.PathAccessor<Env, typeof State.Type>
        readonly input: Path.PathAccessor<Env, typeof Input.Type>
      }) => ReadonlyArray<Transition.WriteEquation<typeof State.Type, typeof Input.Type>>,
    ) =>
      Abstract.checkTransition(State, Transition.make({ state: State, input: Input, apply }))._tag
    // Paths typed as the field they are written to, reading an input field that is wider.
    const maybe = Path.make<Env, number>(['input', 'maybe'])
    const wide = Path.make<Env, 'a' | 'b'>(['input', 'wide'])

    // A bound inside `NullOr`, which no rule states.
    expect(writing(({ state }) => [Transition.set(state.n, -5)])).toBe('False')
    expect(writing(({ state }) => [Transition.set(state.n, null)])).toBe('True')
    expect(writing(({ state }) => [Transition.set(state.n, state.m)])).toBe('True')
    expect(writing(({ state }) => [Transition.set(state.n, maybe)])).toBe('Unknown')
    // Being an integer.
    expect(writing(({ state }) => [Transition.set(state.m, Num.mul(state.m, 0.5))])).toBe('Unknown')
    expect(writing(({ state }) => [Transition.set(state.m, 0.5)])).toBe('False')
    // Not being null.
    expect(writing(({ state }) => [Transition.set(state.k, maybe)])).toBe('Unknown')
    expect(writing(({ state }) => [Transition.set(state.k, state.m)])).toBe('True')
    // A literal of the enumeration.
    expect(writing(({ state, input }) => [Transition.set(state.status, input.status)])).toBe('True')
    expect(writing(({ state }) => [Transition.set(state.status, 'b')])).toBe('True')
    expect(writing(({ state }) => [Transition.set(state.status, wide)])).toBe('Unknown')
    expect(writing(({ state, input }) => [Transition.set(state.label, input.text)])).toBe('True')
  })

  it('counts a refused write as no transition', () => {
    const State = Schema.Struct({ start: Schema.Int, end: Schema.Int }).pipe(
      Expr.refine(s => Ord.lte(s.start, s.end)),
    )
    const Extend = Transition.make({
      state: State,
      input: Schema.Struct({ days: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)) }),
      apply: ({ state, input }) => [Transition.set(state.end, Num.add(state.end, input.days))],
    })
    expect(Abstract.checkTransition(State, Extend)._tag).toBe('True')
    expect(
      Result.isFailure(Transition.run(Extend, { start: 0, end: 2 ** 53 - 1 }, { days: 1 })),
    ).toBe(true)
  })
})

describe('a key that may be absent', () => {
  it('is not known to be present', () => {
    const Named = Schema.Struct({ name: Schema.optionalKey(Schema.String) })
    const named = Path.from(Named)
    unproved(Named, Null.isNotNull(named.name), {})
    expect(Verdict.isFalse(Abstract.checkInvariant(Named, Null.isNull(named.name)))).toBe(false)
  })

  it('makes every field under it one that may be null', () => {
    const Parent = Schema.Struct({
      child: Schema.optionalKey(Schema.Struct({ s: Schema.String, n: Schema.Int })),
      held: Schema.NullOr(Schema.Struct({ s: Schema.String })),
    })
    const Env = Schema.Struct({ row: Parent })
    const child = Path.make<typeof Env.Type, string>(['row', 'child', 's'])
    const held = Path.make<typeof Env.Type, string>(['row', 'held', 's'])
    unproved(Env, Null.isNotNull(child), { row: { held: null } })
    unproved(Env, Null.isNotNull(held), { row: { held: null } })
    proved(Env, Null.isNotNull(Path.from(Env).row))
  })

  it('does not take a rule on an absent field for a fact about it', () => {
    const Opt = Schema.Struct({
      o: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
    })
    const o = Path.make<typeof Opt.Type, number | null>(['o'])
    unproved(Opt, Null.isNotNull(o), {})
    proved(Opt, Expr.any(Null.isNull(o), Ord.gte(o, 0)))
  })

  it('is a case of a match on it', () => {
    const Enum = Schema.Struct({ status: Schema.optionalKey(Schema.Literals(['a', 'b'])) })
    const status = Path.make<typeof Enum.Type, 'a' | 'b' | null>(['status'])
    unproved(Enum, Ord.lte(Expr.matchOrElse(status, { a: 1, b: 2 }, 100), 2), {})
    proved(Enum, Ord.lte(Expr.matchOrElse(status, { a: 1, b: 2 }, 100), 100))
  })
})

describe('a value that may be null', () => {
  it('makes a comparison over it one that may not hold', () => {
    const Row = Schema.Struct({
      n: Schema.NullOr(Schema.Int.check(Schema.isBetween({ minimum: 3, maximum: 3 }))),
      name: Schema.NullOr(Schema.String),
      flag: Schema.NullOr(Schema.Boolean),
    })
    const row = Path.from(Row)
    const nulls = { n: null, name: null, flag: null }
    unproved(Row, Ord.gte(row.n, 0), nulls)
    unproved(Row, Bool.not(Ord.lt(row.n, 0)), nulls)
    unproved(Row, Eq.is(row.n, 3), nulls)
    unproved(Row, Str.startsWith(row.name, ''), nulls)
    unproved(Row, Expr.any(row.flag, Bool.not(row.flag)), nulls)
    unproved(Row, Expr.when(row.flag, { then: true, else: true }), nulls)
    // What is known not to be null is decided as before.
    proved(Row, Expr.implies(Null.isNotNull(row.n), Ord.gte(row.n, 3)))
    // Text may hold a NUL, which `startsWith` refuses: not null is not enough.
    unproved(Row, Expr.implies(Null.isNotNull(row.name), Str.startsWith(row.name, '')), {
      ...nulls,
      name: 'a\u0000',
    })
    proved(Row, Expr.any(Null.isNull(row.n), Eq.is(row.n, 3)))
  })

  it('is not made false by the negation of a rule holding', () => {
    const Flagged = Schema.Struct({ flag: Schema.NullOr(Schema.Boolean) }).pipe(
      Expr.refine(s => Null.isNull(s.flag)),
    )
    unproved(Flagged, Eq.is(Path.from(Flagged).flag, false), { flag: null })
  })
})

describe('arithmetic', () => {
  it('past the safe range is refused, so nothing is proved of its result', () => {
    const Big = Schema.Struct({
      x: Schema.Int.check(Schema.isGreaterThanOrEqualTo(2 ** 53 - 1)),
      y: Schema.Int.check(Schema.isBetween({ minimum: 2, maximum: 2 })),
    })
    const big = Path.from(Big)
    unproved(Big, Ord.gte(Num.sub(Num.add(big.x, big.y), big.x), 2), { x: 2 ** 53 - 1, y: 2 })
    unproved(Count, Ord.gt(Num.add($.x, 1), $.x), { x: 2 ** 53 - 1 })
    const Small = Schema.Struct({
      x: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 9 })),
    })
    proved(Small, Ord.gt(Num.add(Path.from(Small).x, 1), Path.from(Small).x))
  })

  it('over doubles is not moved across a comparison', () => {
    const Near = Schema.Finite.check(Schema.isBetween({ minimum: -10, maximum: 10 }))
    const Pair = Schema.Struct({ x: Near, y: Near }).pipe(
      Expr.refine(s => Ord.lte(s.x, Num.add(s.y, 0.1))),
    )
    const pair = Path.from(Pair)
    unproved(Pair, Ord.lte(Num.sub(pair.x, pair.y), 0.1), { x: 1.1, y: 1 })
  })

  it('that may overflow a double is not bounded', () => {
    const Float = Schema.Struct({ x: Schema.Finite })
    const float = Path.from(Float)
    unproved(Float, Eq.is(Num.mul(Num.mul(float.x, float.x), 0), 0), { x: 1e200 })
  })

  it('at the ends of the safe range is not read as a contradiction', () => {
    const Ends = Schema.Struct({
      lo: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 1 })),
      hi: Schema.Int.check(Schema.isGreaterThanOrEqualTo(2 ** 53 - 1)),
    })
    const ends = Path.from(Ends)
    unproved(Ends, Ord.gt(Num.sub(ends.lo, ends.hi), 0), { lo: 1, hi: 2 ** 53 - 1 })
  })
})

describe('bounds', () => {
  const Real = Schema.Struct({ y: Schema.Finite })
  const real = Path.from(Real)

  it('a strict rule over reals does not tighten by one', () => {
    const Below = Real.pipe(Expr.refine(s => Ord.lt(s.y, 5)))
    unproved(Below, Ord.lte(Path.from(Below).y, 4), { y: 4.5 })
    const Above = Schema.Struct({ y: Schema.Finite.check(Schema.isGreaterThan(0.5)) })
    unproved(Above, Ord.gte(Path.from(Above).y, 1), { y: 0.75 })
    const Whole = Schema.Struct({ y: Schema.Int.check(Schema.isGreaterThan(0.5)) })
    proved(Whole, Ord.gte(Path.from(Whole).y, 1))
  })

  it('a strict goal is not proved from a bound that is not strict', () => {
    const AtMost = Schema.Struct({ a: Schema.Int, b: Schema.Int }).pipe(
      Expr.refine(s => Ord.lte(s.a, s.b)),
    )
    const pair = Path.from(AtMost)
    unproved(AtMost, Ord.lt(pair.a, pair.b), { a: 1, b: 1 })
    proved(AtMost, Ord.lte(pair.a, pair.b))
    unproved(Real, Ord.lt(real.y, real.y), { y: 1 })
  })

  it('membership bounds a number by its largest candidate', () => {
    const In = Count.pipe(Expr.refine(s => Eq.in(s.x, [1, 5, 9])))
    const x = Path.from(In).x
    unproved(In, Ord.lte(x, 1), { x: 9 })
    proved(In, Ord.lte(x, 9))
    proved(In, Ord.gte(x, 1))
  })

  it('a sum is bounded by the upper end of what is added', () => {
    const Sum = Schema.Struct({
      x: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100 })),
      d: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 5 })),
    })
    const sum = Path.from(Sum)
    unproved(Sum, Ord.lte(Num.add(sum.x, sum.d), Num.add(sum.x, 1)), { x: 0, d: 5 })
    proved(Sum, Ord.lte(Num.sub(Num.add(sum.x, sum.d), sum.x), 5))
  })

  it('a field named with a dot is not the field it spells', () => {
    const Dotted = Schema.Struct({
      'a.b': Schema.Int.check(Schema.isGreaterThanOrEqualTo(10)),
      a: Schema.Struct({ b: Schema.Int }),
    })
    unproved(Dotted, Ord.gte(Path.from(Dotted).a.b, 10), { 'a.b': 10, a: { b: -1 } })
  })
})
