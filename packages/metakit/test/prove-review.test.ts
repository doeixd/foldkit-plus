/**
 * What the solver may and may not conclude: a proof speaks for every value
 * the Schema accepts (null, an absent parent and an unnamed case included),
 * and a refutation is an environment that replays.
 */
import { Effect, Option, Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Arr, Eq, Expr, Null, Num, Ord, Path, Str, Transition, Verdict } from '@doeixd/metakit'
import * as Machine from '@doeixd/metakit/machine'
import * as Prove from '@doeixd/metakit/prove'

const run = Effect.runPromise
const reasonOf = (verdict: Verdict.Verdict<unknown>): string =>
  Verdict.isUnknown(verdict) ? verdict.reason : verdict._tag
const witnessOf = (verdict: Verdict.Verdict<Readonly<Record<string, unknown>>>) =>
  Verdict.isFalse(verdict) ? verdict.witness : Option.none()

describe('what may be null', () => {
  const Profile = Schema.Struct({ age: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)) })
  const State = Schema.Struct({
    tags: Schema.NullOr(Schema.Array(Schema.String)),
    profile: Schema.NullOr(Profile),
    either: Schema.NullOr(Schema.Union([Schema.String, Schema.Finite])),
    later: Schema.UndefinedOr(Schema.Int),
    skipped: Schema.optionalKey(Schema.Int),
    name: Schema.String,
  })
  const $ = Path.forSchema(State)

  it.each([
    ['a nullable array', Null.isNotNull($.tags), 'tags'],
    ['a nullable struct', Null.isNotNull($.profile), 'profile'],
    ['a nullable union', Null.isNotNull($.either), 'either'],
    ['a value that may be undefined', Null.isNotNull($.later), 'later'],
  ])(
    'is %s: a proof that it is not null is refuted by the null',
    async (_, goal, key) => {
      const verdict = await run(Prove.invariant(State, goal))
      expect(Verdict.isFalse(verdict)).toBe(true)
      expect(Expr.eval(goal, { ...sample, [key]: null })).toBe(false)
    },
    30_000,
  )

  const sample: typeof State.Type = {
    tags: [],
    profile: { age: 1 },
    either: 'a',
    later: 1,
    name: 'n',
  }

  it('is a field read through a parent that may be null', async () => {
    // The bound holds of every age there is; under a null profile there is none to compare.
    const age = Path.make<typeof State.Type, number>(['profile', 'age'])
    const verdict = await run(Prove.invariant(State, Ord.gte(age, 0)))
    expect(Verdict.isFalse(verdict)).toBe(true)
    expect(Option.getOrThrow(witnessOf(verdict))['profile.age']).toBeUndefined()
    const guarded = Expr.any(Null.isNull($.profile), Ord.gte(age, 0))
    expect(Verdict.isTrue(await run(Prove.invariant(State, guarded)))).toBe(true)
  }, 30_000)

  it('is an optional key, which reads as null where it is left out', async () => {
    const skipped = Path.make<typeof State.Type, number>(['skipped'])
    const either = Expr.any(Ord.gt(skipped, 0), Ord.lte(skipped, 0))
    expect(Verdict.isFalse(await run(Prove.invariant(State, either)))).toBe(true)
    const present = Expr.any(Null.isNull($.skipped), either)
    expect(Verdict.isTrue(await run(Prove.invariant(State, present)))).toBe(true)
  }, 30_000)

  it('is not a required field of a required struct', async () => {
    expect(Verdict.isTrue(await run(Prove.invariant(State, Null.isNotNull($.name))))).toBe(true)
  }, 30_000)
})

describe('a refutation replays, or is not one', () => {
  it('does not refute a length the solver holds apart from the text', async () => {
    const Named = Schema.Struct({ name: Schema.String })
    const $ = Path.forSchema(Named)
    const goal = Expr.implies(Eq.is($.name, 'abc'), Eq.is(Str.len($.name), 3))
    expect(Expr.eval(goal, { name: 'abc' })).toBe(true)
    expect(reasonOf(await run(Prove.invariant(Named, goal)))).toBe(
      'the solver assignment could not be reproduced on a valid environment',
    )
  }, 30_000)

  it('does not refute with a value a check outside its reading refuses', async () => {
    const Named = Schema.Struct({ name: Schema.String.check(Schema.isMinLength(3)) })
    const goal = Ord.gte(Str.len(Path.forSchema(Named).name), 3)
    expect(Verdict.isFalse(await run(Prove.invariant(Named, goal)))).toBe(false)
  }, 30_000)

  it('gives a text witness the length the solver chose for it', async () => {
    const Named = Schema.Struct({ name: Schema.String })
    const verdict = await run(
      Prove.invariant(Named, Ord.lt(Str.len(Path.forSchema(Named).name), 4)),
    )
    const name = Option.getOrThrow(witnessOf(verdict))['name']
    expect(typeof name === 'string' && [...name].length).toBeGreaterThanOrEqual(4)
  }, 30_000)

  it('refutes a count with an array it cannot build only as undecided', async () => {
    const Tagged = Schema.Struct({ tags: Schema.Array(Schema.String) })
    const goal = Ord.lt(Arr.count(Path.forSchema(Tagged).tags), 2)
    expect(Verdict.isFalse(await run(Prove.invariant(Tagged, goal)))).toBe(false)
  }, 30_000)
})

describe('what the lowering leaves undecided', () => {
  it('a match that may meet a value none of its cases names', async () => {
    const Named = Schema.Struct({ name: Schema.String, plan: Schema.Literals(['free', 'pro']) })
    const $ = Path.forSchema(Named)
    const open = Eq.is(Expr.match($.name, { a: 1 }), 1)
    expect(Result.isFailure(Expr.evalResult(open, { name: 'z', plan: 'free' }))).toBe(true)
    const undecided = await run(Prove.invariant(Named, open))
    expect(reasonOf(undecided)).toContain('a match that may meet a value none of its cases names')
    expect(Verdict.isUnknown(undecided) && undecided.obligation).toEqual(
      Option.some({ kind: 'unsupported', detail: expect.any(String) }),
    )
    const closed = Ord.gte(Expr.match($.plan, { free: 0, pro: 9 }), 0)
    expect(
      Verdict.isTrue(
        await run(
          Prove.policy(
            { row: Named },
            Expr.lift(Path.make<{ row: typeof Named.Type }, typeof Named.Type>(['row']), closed),
          ),
        ),
      ),
    ).toBe(true)
  }, 30_000)

  it('an equality of text and a number, which share the solver’s integers', async () => {
    const Mixed = Schema.Struct({ n: Schema.Int, s: Schema.String })
    // The path claims text where the Schema holds a number: code 1 would meet the number 1.
    const asText = Path.make<typeof Mixed.Type, string>(['n'])
    const verdict = await run(Prove.invariant(Mixed, Eq.isNot(asText, 'a')))
    expect(reasonOf(verdict)).toContain('eq.is of a num and a text')
  }, 30_000)

  it('a bound or a literal that is a fraction, without failing', async () => {
    const Half = Schema.Struct({
      n: Schema.Int.check(Schema.isGreaterThan(0.5)),
      k: Schema.Literals([0.5, 1.5]),
    })
    const $ = Path.forSchema(Half)
    // An integer above 0.5 is at least 1.
    expect(
      Verdict.isTrue(
        await run(Prove.policy({ row: Half }, Ord.gte(Path.forEnv({ row: Half }).row.n, 1))),
      ),
    ).toBe(true)
    const verdict = await run(Prove.invariant(Half, Ord.gt($.k, 1)))
    expect(Option.getOrThrow(witnessOf(verdict))['k']).toBe(0.5)
  }, 30_000)

  it('a goal the solver cannot settle in the time it is given', async () => {
    const Cube = Schema.Struct({ x: Schema.Int, y: Schema.Int, z: Schema.Int })
    const $ = Path.forSchema(Cube)
    const cube = (n: typeof $.x) => Num.mul(n, Num.mul(n, n))
    // x^3 + y^3 = z^3 + 42 over bounded integers: nothing the solver finds in a millisecond.
    const bounded = (n: typeof $.x) => Expr.all(Ord.gte(n, -100_000), Ord.lte(n, 100_000))
    const goal = Expr.implies(
      Expr.all(bounded($.x), bounded($.y), bounded($.z)),
      Eq.isNot(Num.add(cube($.x), cube($.y)), Num.add(cube($.z), 42)),
    )
    const verdict = await run(Prove.invariant(Cube, goal, { timeoutMs: 1 }))
    expect(Verdict.isUnknown(verdict) && verdict.obligation).toEqual(
      Option.some({ kind: 'budget', detail: expect.any(String) }),
    )
    expect(reasonOf(verdict)).toBe('z3 gave up after 1ms')
  }, 30_000)
})

describe('a transition and the paths it writes', () => {
  const Profile = Schema.Struct({ age: Schema.Int })
  const State = Schema.Struct({ profile: Profile, n: Schema.Int }).pipe(
    Expr.refine($ => Ord.gte($.profile.age, 0)),
  )

  it('follows a write to a parent into the field a rule reads', async () => {
    const Replace = Transition.make({
      state: State,
      input: Schema.Struct({ next: Profile }),
      apply: ({ state, input }) => [Transition.set(state.profile, input.next)],
    })
    const verdict = await run(Prove.transition(State, Replace))
    const witness = Option.getOrThrow(witnessOf(verdict))
    expect(witness['input.next.age']).toBeLessThan(0)
    const broken = Transition.run(Replace, { profile: { age: 1 }, n: 0 }, { next: { age: -5 } })
    expect(Result.isSuccess(broken) && Schema.is(State)(broken.success)).toBe(false)

    const Checked = Transition.make({
      state: State,
      input: Schema.Struct({ next: Profile }),
      when: ({ input }) => Ord.gte(input.next.age, 0),
      apply: ({ state, input }) => [Transition.set(state.profile, input.next)],
    })
    expect(Verdict.isTrue(await run(Prove.transition(State, Checked)))).toBe(true)
  }, 30_000)

  it('follows a literal written to a parent', async () => {
    const reset = (age: number) =>
      Transition.make({
        state: State,
        input: Schema.Struct({}),
        apply: ({ state }) => [Transition.set(state.profile, { age })],
      })
    expect(Verdict.isTrue(await run(Prove.transition(State, reset(0))))).toBe(true)
    expect(Verdict.isFalse(await run(Prove.transition(State, reset(-1))))).toBe(true)
  }, 30_000)

  it('holds a written value to a bound declared inside NullOr, which no rule reads', async () => {
    const Stock = Schema.Struct({
      left: Schema.NullOr(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
    })
    const left = Path.make<Transition.TransitionEnv<typeof Stock.Type, {}>, number>([
      'state',
      'left',
    ])
    const take = (guarded: boolean) =>
      Transition.make({
        state: Stock,
        input: Schema.Struct({}),
        when: () => (guarded ? Ord.gte(left, 1) : true),
        apply: ({ state }) => [Transition.set(state.left, Num.sub(left, 1))],
      })
    const refuted = await run(Prove.transition(Stock, take(false)))
    expect(Option.getOrThrow(witnessOf(refuted))).toEqual({ 'state.left': 0 })
    expect(Verdict.isTrue(await run(Prove.transition(Stock, take(true))))).toBe(true)
  }, 30_000)

  it('reports a refuted transition with the rule its replay breaks', async () => {
    const Replace = Transition.make({
      state: State,
      input: Schema.Struct({ next: Profile }),
      apply: ({ state, input }) => [Transition.set(state.profile, input.next)],
    })
    const report = await run(
      Prove.machine(Machine.make({ state: State, transitions: { Replace } })),
    )
    const [entry] = report.entries
    expect(entry!.status).toBe('refuted')
    const witness = Option.getOrThrow(entry!.witness)
    expect(witness.violated).toEqual(['(profile.age >= 0)'])
    expect(Schema.is(State)(witness.before)).toBe(true)
    expect(Schema.is(State)(witness.after)).toBe(false)
    expect(report.format()).toContain(`repro:    ${witness.reproducer}`)
  }, 30_000)

  it.each([
    { schema: Schema.Undefined, expected: undefined },
    { schema: Schema.Null, expected: null },
  ])(
    'replays a solver witness with input $expected',
    async ({ schema, expected }) => {
      const state = Schema.Struct({ count: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)) })
      const subtract = Transition.make({
        state,
        input: schema,
        apply: ({ state }) => [Transition.add(state.count, -1)],
      })
      const report = await run(
        Prove.machine(Machine.make({ state, transitions: { Subtract: subtract } })),
      )
      const [entry] = report.entries
      expect(entry!.status).toBe('refuted')
      const witness = Option.getOrThrow(entry!.witness)
      expect(witness.input).toBe(expected)
      const before = Schema.decodeUnknownSync(state)(witness.before)
      expect(Result.getOrThrow(Transition.run(subtract, before, expected))).toEqual({ count: -1 })
    },
    30_000,
  )
})
