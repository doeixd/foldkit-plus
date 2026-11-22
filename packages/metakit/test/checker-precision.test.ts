/**
 * Precision the Tier 3 checker regained after Phase 1, each without an
 * answer a concrete value contradicts: a strict comparison of a double
 * narrows by the next double; a sum with a negated operand is the difference
 * it equals; a difference of doubles is bounded by the difference's bounds.
 * The seeded check at the end runs every verdict it gets against evaluation.
 */
import { Result, Schema } from 'effect'
import { Abstract, Bool, Eq, Expr, Interval, Num, Ord, Path, Transition, Verdict } from 'metakit'
import { describe, expect, it } from 'vitest'

const MIN = Number.MIN_VALUE
const MAX = Number.MAX_VALUE
const EPS = Number.EPSILON

describe('nextUp and nextDown', () => {
  it.each([
    ['0', 0, MIN, -MIN],
    ['-0', -0, MIN, -MIN],
    ['the least subnormal', MIN, 2 * MIN, 0],
    ['minus the least subnormal', -MIN, 0, -2 * MIN],
    ['the largest subnormal', 2 ** -1022 - MIN, 2 ** -1022, 2 ** -1022 - 2 * MIN],
    ['the least normal', 2 ** -1022, 2 ** -1022 + MIN, 2 ** -1022 - MIN],
    ['1', 1, 1 + EPS, 1 - EPS / 2],
    ['2', 2, 2 + 2 * EPS, 2 - EPS],
    ['-1', -1, -1 + EPS / 2, -1 - EPS],
    ['2^53', 2 ** 53, 2 ** 53 + 2, 2 ** 53 - 1],
    ['the largest finite', MAX, Infinity, MAX - 2 ** 971],
    ['minus the largest finite', -MAX, -MAX + 2 ** 971, -Infinity],
    ['+∞', Infinity, Infinity, MAX],
    ['-∞', -Infinity, -MAX, -Infinity],
  ])('step from %s', (_, n, up, down) => {
    expect(Interval.nextUp(n)).toBe(up)
    expect(Interval.nextDown(n)).toBe(down)
  })

  it('leave NaN as it is', () => {
    expect(Interval.nextUp(Number.NaN)).toBeNaN()
    expect(Interval.nextDown(Number.NaN)).toBeNaN()
  })

  it('give the adjacent double, with none between, for doubles of every exponent', () => {
    const view = new DataView(new ArrayBuffer(8))
    let seed = 0x9e3779b9
    const next = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed
    }
    for (let at = 0; at < 2000; at++) {
      view.setUint32(0, next())
      view.setUint32(4, next())
      const d = view.getFloat64(0)
      if (!Number.isFinite(d) || Math.abs(d) === MAX) continue
      for (const [from, to] of [
        [d, Interval.nextUp(d)],
        [Interval.nextDown(d), d],
      ] as const) {
        expect(to > from, `${from} < ${to}`).toBe(true)
        // Two adjacent doubles differ by one unit, exactly, and their midpoint rounds to one of them.
        const mid = from + (to - from) / 2
        expect(mid === from || mid === to, `nothing between ${from} and ${to}`).toBe(true)
      }
    }
  })
})

const Real = Schema.Struct({ x: Schema.Finite })
const real = Path.from(Real)

describe('a strict comparison of a double', () => {
  it('against the comparison that is not strict, of the same constant, is empty', () => {
    const apart = Expr.implies(Ord.lt(real.x, 0), Bool.not(Ord.gte(real.x, 0)))
    expect(Abstract.checkInvariant(Real, apart)._tag).toBe('True')
    expect(
      Abstract.checkInvariant(
        Real,
        Expr.implies(Ord.gt(real.x, 1), Ord.gte(real.x, Interval.nextUp(1))),
      )._tag,
    ).toBe('True')
  })

  it('narrows by one double, and not by more', () => {
    expect(
      Abstract.checkInvariant(Real, Expr.implies(Ord.lt(real.x, 0), Ord.lte(real.x, -MIN)))._tag,
    ).toBe('True')
    const tooFar = Expr.implies(Ord.lt(real.x, 0), Ord.lt(real.x, -MIN))
    expect(Expr.holds(tooFar, { x: -MIN })).toBe(false)
    expect(Verdict.isTrue(Abstract.checkInvariant(Real, tooFar))).toBe(false)
  })

  it('read off a Schema narrows the field', () => {
    const Positive = Schema.Struct({ x: Schema.Finite.check(Schema.isGreaterThan(0)) })
    const positive = Path.from(Positive)
    expect(Abstract.checkInvariant(Positive, Ord.gte(positive.x, MIN))._tag).toBe('True')
    expect(Verdict.isTrue(Abstract.checkInvariant(Positive, Ord.gt(positive.x, MIN)))).toBe(false)
  })

  it('makes a guard no row meets one the checker sees', () => {
    const State = Real.pipe(Expr.refine(s => Ord.gte(s.x, 0)))
    const Below = Transition.make({
      state: State,
      input: Schema.Struct({}),
      when: ({ state }) => Ord.lt(state.x, 0),
      apply: ({ state }) => [Transition.set(state.x, 1)],
    })
    const next = Path.forEnv({ next: State }).next
    // `false` holds of every step: there is none.
    expect(Abstract.checkGoal(State, Below, { goal: Eq.is(next.x, -1) })._tag).toBe('True')
  })
})

/** The ways to write `x - amount`. */
const forms = ['sub', 'add of neg', 'neg first', 'sub of neg of neg'] as const
type Form = (typeof forms)[number]

const written = <E>(form: Form, x: Expr.Expr<E, number>, amount: Expr.Expr<E, number>) =>
  ({
    sub: Num.sub(x, amount),
    'add of neg': Num.add(x, Num.neg(amount)),
    'neg first': Num.add(Num.neg(amount), x),
    'sub of neg of neg': Num.sub(x, Num.neg(Num.neg(amount))),
  })[form]

/** A withdrawal within the balance, `x - amount` written as `form`, and whether it leaves `x >= 0`. */
const withdrawal = (number: Schema.Codec<number>, form: Form) => {
  const State = Schema.Struct({ x: number })
  const Withdraw = Transition.make({
    state: State,
    input: Schema.Struct({ amount: number }),
    when: ({ state, input }) => Ord.gte(state.x, input.amount),
    apply: ({ state, input }) => [Transition.set(state.x, written(form, state.x, input.amount))],
  })
  const next = Path.forEnv({ next: State }).next
  return Abstract.checkGoal(State, Withdraw, { goal: Ord.gte(next.x, 0) })
}

describe('a decrement written with a negation', () => {
  it.each(forms)('is related as the difference it is, over integers: %s', form => {
    expect(withdrawal(Schema.Int, form)).toMatchObject({
      _tag: 'True',
      evidence: { value: { tier: 'zone' } },
    })
  })

  it.each(forms)('is bounded by the difference of doubles, which rounding keeps: %s', form => {
    expect(withdrawal(Schema.Finite, form)._tag).toBe('True')
  })

  it('keeps a -(-y) that is not an operand of a sum, whose interval follows that of -y', () => {
    // An infinite y makes -(-y) refused where y is not, so outside a sum it is not y.
    const Plain = Schema.Struct({ y: Schema.Number })
    const plain = Path.from(Plain)
    const same = Eq.is(Num.neg(Num.neg(plain.y)), plain.y)
    expect(Result.isFailure(Expr.evalResult(same, { y: Infinity }))).toBe(true)
    expect(Verdict.isTrue(Abstract.checkInvariant(Plain, same))).toBe(false)
    const Count = Schema.Struct({ x: Schema.Int })
    const count = Path.from(Count)
    expect(Abstract.checkInvariant(Count, Ord.gte(Num.abs(Num.neg(count.x)), 0))._tag).toBe('True')
  })

  it('of doubles is not bounded where the difference is not', () => {
    // `x - y` rounds, so a bound on the rounded difference says nothing exact of `x` against `y`.
    const Pair = Schema.Struct({ x: Schema.Finite, y: Schema.Finite })
    const pair = Path.from(Pair)
    const backwards = Expr.implies(
      Ord.lte(Num.sub(pair.x, pair.y), 1),
      Ord.lte(Num.sub(pair.x, 1), pair.y),
    )
    // 1 - (-ε/4) rounds to 1, yet 1 - 1 is above -ε/4.
    expect(Expr.holds(backwards, { x: 1, y: -EPS / 4 })).toBe(false)
    expect(Verdict.isTrue(Abstract.checkInvariant(Pair, backwards))).toBe(false)
  })
})

/** mulberry32: a small seeded generator, so a failing goal can be built again. */
const random = (seed: number) => {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const Seeded = Schema.Struct({
  x: Schema.Finite.check(Schema.isBetween({ minimum: -8, maximum: 8 })),
  y: Schema.Finite.check(Schema.isBetween({ minimum: -8, maximum: 8 })),
  z: Schema.Finite,
  n: Schema.Int.check(Schema.isBetween({ minimum: -5, maximum: 5 })),
  s: Schema.Literals(['a', 'b', 'c']),
  t: Schema.NullOr(Schema.Literals(['a', 'b'])),
  f: Schema.Boolean,
})
type Env = typeof Seeded.Type
type Num = Expr.Expr<Env, number>
type Truth = Expr.Expr<Env, boolean | null>
const $ = Path.from(Seeded)

/** The numbers goals name and environments hold: the zeros, subnormals, steps beside 1, the ends. */
const POOL = [
  0,
  -0,
  MIN,
  -MIN,
  0.5,
  1,
  Interval.nextUp(1),
  Interval.nextDown(1),
  -1,
  2,
  -2,
  3,
  8,
  -8,
]
const BEYOND = [MAX, -MAX, 2 ** 53, 1e300]

/** One goal of the shapes this file is about: strict and loose comparisons, negations, literal equalities. */
const goalOf = (seed: number): Truth => {
  const next = random(seed)
  const pick = <T>(choices: ReadonlyArray<T>): T => choices[Math.floor(next() * choices.length)]!
  const number = (depth: number): Num => {
    const leaf = (): Num =>
      next() < 0.75 ? pick<Num>([$.x, $.y, $.z, $.n]) : Expr.lit<number>(pick(POOL))
    if (depth === 0 || next() < 0.35) return leaf()
    const [a, b] = [number(depth - 1), number(depth - 1)]
    return pick<() => Num>([
      () => Num.add(a, b),
      () => Num.sub(a, b),
      () => Num.neg(a),
      () => Num.add(a, Num.neg(b)),
      () => Num.add(Num.neg(a), b),
      () => Num.sub(a, Num.neg(b)),
      () => Num.neg(Num.neg(a)),
    ])()
  }
  const truth = (depth: number): Truth => {
    const atom = (): Truth =>
      pick<() => Truth>([
        () => pick([Ord.lt, Ord.lte, Ord.gt, Ord.gte])(number(2), number(1)),
        () => pick([Ord.lt, Ord.lte, Ord.gt, Ord.gte])(number(1), pick(POOL)),
        () => Eq.is($.s, pick(['a', 'b', 'c'] as const)),
        () => Eq.equals($.s, pick(['a', 'b', 'c'] as const)),
        () => Eq.isNot($.s, pick(['a', 'b', 'c'] as const)),
        () => Eq.is($.t, pick(['a', 'b', null] as const)),
        () => Eq.equals($.t, pick(['a', 'b'] as const)),
        () => Eq.is($.f, pick([true, false])),
      ])()
    if (depth === 0 || next() < 0.3) return atom()
    const [a, b] = [truth(depth - 1), truth(depth - 1)]
    return pick<() => Truth>([
      () => Bool.not(a),
      () => Bool.and(a, b),
      () => Bool.or(a, b),
      () => Expr.implies(a, b),
    ])()
  }
  return truth(3)
}

/** Environments the Schema admits, from the pool: random ones, and every value of each member beside fixed others. */
const environments = (seed: number): ReadonlyArray<Env> => {
  const next = random(seed)
  const pick = <T>(choices: ReadonlyArray<T>): T => choices[Math.floor(next() * choices.length)]!
  const inRange = POOL.filter(value => Math.abs(value) <= 8)
  const out: Array<Env> = []
  for (let at = 0; at < 1500; at++) {
    out.push({
      x: pick(inRange),
      y: pick(inRange),
      z: pick([...POOL, ...BEYOND]),
      n: pick([-5, -2, -1, 0, 1, 2, 5]),
      s: pick(['a', 'b', 'c'] as const),
      t: pick(['a', 'b', null] as const),
      f: pick([true, false]),
    })
  }
  return out.filter(Schema.is(Seeded))
}

describe('every verdict, against evaluation', () => {
  it('is True only where every environment tried evaluates the goal to true, False only where to false', () => {
    const envs = environments(7)
    const decided = { True: 0, False: 0 }
    for (let seed = 1; seed <= 1500; seed++) {
      const goal = goalOf(seed)
      const verdict = Abstract.checkInvariant(Seeded, goal)
      if (Verdict.isUnknown(verdict)) continue
      decided[verdict._tag]++
      const want = Verdict.isTrue(verdict)
      for (const env of envs) {
        const value = Expr.evalResult(goal, env)
        expect(
          Result.isSuccess(value) && value.success === want,
          `seed ${seed}: ${verdict._tag} of ${Expr.show(goal)}, but ${JSON.stringify(env)} gives ${JSON.stringify(value)}`,
        ).toBe(true)
      }
    }
    // Enough of each answer that the check is not vacuous.
    expect(decided.True).toBeGreaterThan(60)
    expect(decided.False).toBeGreaterThan(20)
  })
})
