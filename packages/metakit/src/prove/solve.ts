import { Data, Effect, Option } from 'effect'
import * as Expr from '../expr.js'
import * as Node from '../node.js'
import type { Slice } from '../abstract/unordered.js'
import type { ProveOptions } from '../prove.js'
import * as Verdict from '../verdict.js'
import { lowering, Unsupported, type Z3 } from './lower.js'
import { shapeOf } from './shape.js'
import { holdsOf, readModel, valid } from './witness.js'

/** `z3-solver`, an optional peer, could not be loaded when a proof needed it. */
export class SolverUnavailableError extends Data.TaggedError('SolverUnavailableError')<{
  readonly cause: unknown
}> {
  override get message(): string {
    return 'metakit/prove needs the optional peer "z3-solver" for a goal its synchronous checks leave undecided'
  }
}

const DEFAULT_TIMEOUT_MS = 10_000

export type Proof = Verdict.Verdict<Readonly<Record<string, unknown>>>

let loadedZ3: Option.Option<Promise<Z3>> = Option.none()

/** The solver context, loaded once; a failed load is not kept, so a later call tries again. */
export const getZ3: Effect.Effect<Z3, SolverUnavailableError> = Effect.tryPromise({
  try: () => {
    if (Option.isSome(loadedZ3)) return loadedZ3.value
    const loading = import('z3-solver').then(async ({ init }) => {
      const { Context } = await init()
      return new Context('metakit')
    })
    loadedZ3 = Option.some(loading)
    loading.catch(() => {
      loadedZ3 = Option.none()
    })
    return loading
  },
  catch: cause => new SolverUnavailableError({ cause }),
})

interface Problem {
  readonly slices: ReadonlyArray<Slice>
  /** Rules that hold of every environment considered. */
  readonly given: ReadonlyArray<Node.Node>
  /** The search is for an environment where one of these does not hold. */
  readonly goals: ReadonlyArray<Node.Node>
  readonly timeoutMs: number
}

type Solved = Data.TaggedEnum<{
  /** No environment keeps `given` and breaks a goal. */
  Unsat: {}
  /** The solver's assignment, as an environment and as `path -> value`. */
  Sat: { readonly env: unknown; readonly flat: Readonly<Record<string, unknown>> }
  Undecided: { readonly reason: string; readonly obligation: Option.Option<Verdict.Obligation> }
}>
const Solved = Data.taggedEnum<Solved>()

const undecided = (reason: string, kind: Verdict.Obligation['kind'], detail: string): Solved =>
  Solved.Undecided({ reason, obligation: Option.some({ kind, detail }) })

const solve = async (z3: Z3, problem: Problem): Promise<Solved> => {
  const shape = shapeOf(problem.slices)
  const solver = new z3.Solver()
  solver.set('timeout', problem.timeoutMs)
  const lowered = lowering(z3, solver, shape)
  const { lower, holds, opaque, nanReads } = lowered

  try {
    for (const rule of problem.given) solver.add(holds(lower(rule)))
    if (problem.goals.length === 0) return Solved.Unsat()
    solver.add(z3.Or(...problem.goals.map(goal => z3.Not(holds(lower(goal))))))
  } catch (error) {
    if (!(error instanceof Unsupported) && !(error instanceof Error)) throw error
    const detail = error.message
    return undecided(`z3 lowering unsupported: ${detail}`, 'unsupported', detail)
  }

  const status = await solver.check()
  if (status === 'unknown') {
    const why = solver.reasonUnknown()
    return /timeout|canceled/.test(why)
      ? undecided(`z3 gave up after ${problem.timeoutMs}ms`, 'budget', why)
      : undecided(`z3 could not decide: ${why}`, 'nonlinear', why)
  }
  if (nanReads.size > 0 && status === 'unsat') {
    const [path] = nanReads
    return Solved.Undecided({
      reason: `"${path}" may hold NaN, which the checkers do not order`,
      obligation: Option.none(),
    })
  }
  if (status === 'unsat') return Solved.Unsat()
  if (opaque.size > 0) {
    return undecided(
      'counterexample involves opaque term',
      'opaque',
      Array.from(opaque.keys()).join(', '),
    )
  }

  return Solved.Sat(readModel(z3, solver.model(), shape, lowered))
}

export const proved: Proof = Verdict.True(Option.some(Verdict.Proved('z3')))

const unreproduced: Proof = Verdict.Unknown(
  'the solver assignment could not be reproduced on a valid environment',
)

/**
 * Search for an environment the Schemas of `slices` accept where every rule
 * of `given` holds and one of `goals` does not. `True`: there is none.
 * `False`: one was found and replayed. Anything else is `Unknown`.
 */
export const refute = (
  slices: ReadonlyArray<Slice>,
  given: ReadonlyArray<Node.Node>,
  goals: ReadonlyArray<Node.Node>,
  options: ProveOptions | undefined,
  reproduces: (env: unknown) => boolean,
): Effect.Effect<
  { readonly verdict: Proof; readonly env: Option.Option<unknown> },
  SolverUnavailableError
> =>
  Effect.gen(function* () {
    const z3 = yield* getZ3
    const rules = slices.flatMap(([under, schema]) =>
      Expr.refinementsOf(schema).map(rule => Node.prefix(rule.node, under)),
    )
    const solved = yield* Effect.promise(() =>
      solve(z3, {
        slices,
        given: [...rules, ...given],
        goals,
        timeoutMs: options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      }),
    )
    return Solved.$match(solved, {
      Unsat: () => ({ verdict: proved, env: Option.none() }),
      Undecided: ({ reason, obligation }) => ({
        verdict: Verdict.Unknown(reason, obligation),
        env: Option.none(),
      }),
      Sat: ({ env, flat }) =>
        valid(slices, env) && given.every(rule => holdsOf(rule, env)) && reproduces(env)
          ? { verdict: Verdict.False(Option.some(flat)), env: Option.some(env) }
          : { verdict: unreproduced, env: Option.none() },
    })
  })
