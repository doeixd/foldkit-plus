/**
 * Dev-only prover (`metakit/prove`): the synchronous Interval and Zone checks
 * first, then the Z3 solver for what they leave undecided.
 *
 * The solver reads an expression as evaluation does: every term is a value
 * and whether it is null, an operator over a null operand is null, `and` and
 * `or` are Kleene, and a rule holds only where it is true. Text and arrays
 * are not modelled beyond their length and count, so a goal that rests on
 * more is undecided. Whatever the solver assigns is replayed through the
 * Schemas and the evaluator before it is called a counterexample.
 */
import { Effect, Schema } from 'effect'
import * as AbstractCheck from './abstract/check.js'
import * as Expr from './expr.js'
import { refute, SolverUnavailableError, type Proof } from './prove/solve.js'
import { proveTransition } from './prove/transition.js'
import { holdsOf } from './prove/witness.js'
import type * as Transition from './transition.js'
import * as Verdict from './verdict.js'

export { machine } from './prove/machine.js'
export type { MachineProofEntry, MachineProofReport } from './prove/machine.js'
export { policy, policyConsistent, policyImplies } from './prove/policy.js'
export { SolverUnavailableError }
export type { WitnessReport } from './prove/witness.js'

export interface ProveOptions {
  /** How long the solver may spend on one proof, in milliseconds. Default 10,000. */
  readonly timeoutMs?: number
}

/** Prove that every value `schema` accepts satisfies `goal`. Runs Tier 3 first; asks Z3 only where it is undecided. */
export const invariant = <S extends Schema.Top>(
  schema: S,
  goal: Expr.Expr<S['Type'], boolean>,
  options?: ProveOptions,
): Effect.Effect<Proof, SolverUnavailableError> => {
  const tier3 = AbstractCheck.checkInvariant(schema, goal)
  if (Verdict.isTrue(tier3)) return Effect.succeed(tier3)
  return Effect.map(
    refute([[[], schema]], [], [goal.node], options, env => !holdsOf(goal.node, env)),
    ({ verdict }) => verdict,
  )
}

/**
 * Prove that `transition` leaves every state `stateSchema` accepts, under an
 * input its input Schema accepts and a guard that holds, a state the Schema
 * still accepts.
 */
export const transition = <S extends Schema.Top, I, Emit>(
  stateSchema: S,
  tr: Transition.Transition<S['Type'], I, Emit>,
  options?: ProveOptions,
): Effect.Effect<Proof, SolverUnavailableError> =>
  Effect.map(
    proveTransition(stateSchema as unknown as Schema.Codec<S['Type']>, tr, options),
    ({ verdict }) => verdict,
  )
