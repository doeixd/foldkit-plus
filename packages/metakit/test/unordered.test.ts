/**
 * A number that may be NaN: every checker orders its numbers, so each stays
 * undecided over one, and decides the same question over a finite number.
 */
import { Effect, Option, Result, Schema } from 'effect'
import { Abstract, Bool, Expr, Num, Path, Transition, Verdict } from 'metakit'
import * as Machine from 'metakit/machine'
import * as Prove from 'metakit/prove'
import { describe, expect, it } from 'vitest'

const gauge = (level: typeof Schema.Number) => {
  const State = Schema.Struct({ level, count: Schema.Int }).pipe(
    Expr.refine($ => Num.gte($.count, 0)),
  )
  const $ = Path.forSchema(State)
  const { row } = Path.forEnv({ row: State })
  // Above zero or not above it, which NaN is neither of.
  const split = Expr.any(Num.gt($.level, 0), Num.lte($.level, 0))
  // Fires where the level is neither at least one nor at most two: for NaN alone.
  const Break = Transition.make({
    state: State,
    input: Schema.Struct({}),
    when: ({ state }) =>
      Expr.all(Bool.not(Num.gte(state.level, 1)), Bool.not(Num.lte(state.level, 2))),
    apply: ({ state }) => [Transition.set(state.count, -1)],
  })
  const run = Effect.runPromise
  return {
    State,
    split,
    Break,
    checks: {
      'Abstract.checkInvariant': async () => Abstract.checkInvariant(State, split),
      'Abstract.checkTransition': async () => Abstract.checkTransition(State, Break),
      'Prove.invariant': () => run(Prove.invariant(State, split)),
      'Prove.transition': () => run(Prove.transition(State, Break)),
      'Prove.policy': () =>
        run(Prove.policy({ row: State }, Expr.any(Num.gt(row.level, 0), Num.lte(row.level, 0)))),
    },
  }
}
const names = Object.keys(gauge(Schema.Finite).checks) as ReadonlyArray<
  keyof ReturnType<typeof gauge>['checks']
>

describe('a number that may be NaN', () => {
  it('is what the proofs would be wrong about', () => {
    const { State, split, Break } = gauge(Schema.Number)
    const held = { level: NaN, count: 0 }
    expect(Schema.is(State)(held)).toBe(true)
    expect(Expr.eval(split, held)).toBe(false)
    expect(Result.getOrThrow(Transition.run(Break, held, {})).count).toBe(-1)
  })

  it.each(names)(
    'leaves %s undecided, naming the path',
    async name => {
      const verdict = await gauge(Schema.Number).checks[name]()
      expect(Verdict.isUnknown(verdict) && verdict.reason).toContain('level" may hold NaN')
    },
    30_000,
  )

  it.each(names)(
    'lets %s prove the same of a finite number',
    async name => {
      expect(Verdict.isTrue(await gauge(Schema.Finite).checks[name]())).toBe(true)
    },
    30_000,
  )

  it('keeps a counterexample, which is a number', async () => {
    const { State } = gauge(Schema.Number)
    const verdict = await Effect.runPromise(
      Prove.invariant(State, Num.gt(Path.forSchema(State).level, 0)),
    )
    const level = Verdict.isFalse(verdict) ? Option.getOrThrow(verdict.witness)['level'] : NaN
    expect(level).toBeLessThanOrEqual(0)
  }, 30_000)

  it('leaves a machine transition over one undecided', async () => {
    const report = (level: typeof Schema.Number) => {
      const { State, Break } = gauge(level)
      return Effect.runPromise(
        Prove.machine(Machine.make({ state: State, transitions: { Break } }), { strict: false }),
      )
    }
    expect((await report(Schema.Number)).entries.map(entry => entry.status)).toEqual(['undecided'])
    expect((await report(Schema.Finite)).entries.map(entry => entry.status)).toEqual(['proved'])
  }, 30_000)
})
