import { Context, Data, Effect, Layer, Option, Semaphore, type Scope } from 'effect'
import type { Solver as Z3Solver } from 'z3-solver'
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
const FP_TIMEOUT_MS = 2_000

export type Proof = Verdict.Verdict<Readonly<Record<string, unknown>>>

type OpenZ3 = () => Z3
let loadedZ3: Option.Option<Promise<OpenZ3>> = Option.none()

/** Load the backend once. Each solve opens its own context so interrupt targets only that solve. */
const loadZ3: Effect.Effect<OpenZ3, SolverUnavailableError> = Effect.tryPromise({
  try: () => {
    if (Option.isSome(loadedZ3)) return loadedZ3.value
    const loading = import('z3-solver').then(async ({ init }) => {
      const { Context } = await init()
      return () => new Context('metakit')
    })
    loadedZ3 = Option.some(loading)
    loading.catch(() => {
      loadedZ3 = Option.none()
    })
    return loading
  },
  catch: cause => new SolverUnavailableError({ cause }),
})

/** The goal handed to a backend after the synchronous checks. */
export interface SolverProblem {
  readonly slices: ReadonlyArray<Slice>
  /** Rules that hold of every environment considered. */
  readonly given: ReadonlyArray<Node.Node>
  /** The search is for an environment where one of these does not hold. */
  readonly goals: ReadonlyArray<Node.Node>
  readonly timeoutMs: number
}

export type SolverAnswer = Data.TaggedEnum<{
  /** No environment keeps `given` and breaks a goal. */
  Unsat: {}
  /** The solver's assignment, as an environment and as `path -> value`. */
  Sat: { readonly env: unknown; readonly flat: Readonly<Record<string, unknown>> }
  Undecided: { readonly reason: string; readonly obligation: Option.Option<Verdict.Obligation> }
}>
export const SolverAnswer = Data.taggedEnum<SolverAnswer>()

const undecided = (
  reason: string,
  kind: Verdict.Obligation['kind'],
  detail: string,
): SolverAnswer => SolverAnswer.Undecided({ reason, obligation: Option.some({ kind, detail }) })

const solve = async (
  z3: Z3,
  solver: Z3Solver<'metakit'>,
  problem: SolverProblem,
  signal: AbortSignal,
): Promise<SolverAnswer> => {
  const shape = shapeOf(problem.slices)
  const hasFp = [...shape.paths.values()].some(info => info.sort === 'real' && info.finite)
  const effectiveTimeout = hasFp ? Math.min(problem.timeoutMs, FP_TIMEOUT_MS) : problem.timeoutMs
  solver.set('timeout', effectiveTimeout)
  const lowered = lowering(z3, solver, shape)
  const { lower, holds, opaque, nanReads } = lowered

  try {
    for (const rule of problem.given) solver.add(holds(lower(rule)))
    if (problem.goals.length === 0) return SolverAnswer.Unsat()
    solver.add(z3.Or(...problem.goals.map(goal => z3.Not(holds(lower(goal))))))
  } catch (error) {
    if (!(error instanceof Unsupported) && !(error instanceof Error)) throw error
    const detail = error.message
    return undecided(`z3 lowering unsupported: ${detail}`, 'unsupported', detail)
  }

  let status = await solver.check()
  signal.throwIfAborted()
  // A witness holds no text with a NUL where one without exists: the replay writes none.
  const nul = lowered.nulFlags()
  if (status === 'sat' && nul.length > 0) {
    solver.add(z3.And(...nul.map(flag => z3.Not(flag))))
    status = await solver.check()
    signal.throwIfAborted()
    if (status === 'unsat') {
      return undecided(
        'every counterexample holds text with a NUL, which the text operations refuse',
        'refused',
        'text holding a NUL',
      )
    }
  }
  if (status === 'unknown') {
    const why = solver.reasonUnknown()
    return /timeout|canceled/.test(why)
      ? undecided(`z3 gave up after ${effectiveTimeout}ms`, 'budget', why)
      : undecided(`z3 could not decide: ${why}`, 'nonlinear', why)
  }
  if (nanReads.size > 0 && status === 'unsat') {
    const [path] = nanReads
    return SolverAnswer.Undecided({
      reason: `"${path}" may hold NaN, which the checkers do not order`,
      obligation: Option.none(),
    })
  }
  if (status === 'unsat') return SolverAnswer.Unsat()
  if (opaque.size > 0) {
    return undecided(
      'counterexample involves opaque term',
      'opaque',
      Array.from(opaque.keys()).join(', '),
    )
  }

  const model = solver.model()
  try {
    return SolverAnswer.Sat(readModel(z3, model, shape, lowered))
  } finally {
    model.release()
  }
}

/** A backend solves one problem at a time per call and can register resources in its scope. */
export interface SolverBackend {
  readonly name: string
  readonly encoding: string
  readonly solve: (
    problem: SolverProblem,
  ) => Effect.Effect<SolverAnswer, SolverUnavailableError, Scope.Scope>
}

// z3-solver serializes WASM checks internally. Keep calls out of that queue so
// an interrupted caller either cancels its own active context or never starts.
const z3Gate = Semaphore.makeUnsafe(1)
const z3Backend: SolverBackend = {
  name: 'z3',
  encoding: 'metakit-smt-v1',
  solve: problem =>
    z3Gate.withPermit(
      Effect.gen(function* () {
        const open = yield* loadZ3
        let running: Promise<SolverAnswer> | undefined
        return yield* Effect.tryPromise({
          try: signal => {
            const z3 = open()
            const solver = new z3.Solver()
            let retry: ReturnType<typeof setInterval> | undefined
            const interrupt = () => {
              z3.interrupt()
              // A cold WASM worker can enter check after the first interrupt.
              retry = setInterval(() => z3.interrupt(), 25)
            }
            signal.addEventListener('abort', interrupt, { once: true })
            running = solve(z3, solver, problem, signal).finally(() => {
              signal.removeEventListener('abort', interrupt)
              clearInterval(retry)
              solver.release()
            })
            return running
          },
          catch: cause => new SolverUnavailableError({ cause }),
        }).pipe(
          Effect.ensuring(
            Effect.promise(async () => {
              // Do not let the next context start until the interrupted call has returned.
              await running?.catch(() => undefined)
            }),
          ),
        )
      }),
    ),
}

/** The solver used for escalation. Supply another backend with `Layer.succeed`. */
export const Solver = Context.Reference<SolverBackend>('metakit/prove/Solver', {
  defaultValue: () => z3Backend,
})

/** The built-in lazy local Z3 backend. */
export const z3SolverLayer = Layer.succeed(Solver, z3Backend)

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
    const backend = yield* Solver
    const rules = slices.flatMap(([under, schema]) =>
      Expr.rulesOf(schema).map(rule => Node.prefix(rule.expr.node, under)),
    )
    const solved = yield* Effect.scoped(
      backend.solve({
        slices,
        given: [...rules, ...given],
        goals,
        timeoutMs: options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      }),
    )
    return SolverAnswer.$match(solved, {
      Unsat: () => ({
        verdict: Verdict.True(
          Option.some(
            Verdict.Proved(backend === z3Backend ? 'z3' : 'solver', {
              backend: backend.name,
              encoding: backend.encoding,
            }),
          ),
        ),
        env: Option.none(),
      }),
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
