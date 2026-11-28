import { Effect, Option, type Schema } from 'effect'
import * as Expr from '../expr.js'
import type * as Path from '../path.js'
import * as Policy from '../policy.js'
import type { ProveOptions } from '../prove.js'
import * as Verdict from '../verdict.js'
import { refute, type Proof, type SolverUnavailableError } from './solve.js'
import { holdsOf } from './witness.js'
import type { Slice } from '../abstract/unordered.js'

/**
 * Prove that `goal` holds of every environment the Schemas of `shape` accept
 * and every rule of `options.hypotheses` holds of.
 */
export const policy = <Shape extends Readonly<Record<string, Schema.Top>>>(
  shape: Shape,
  goal: Expr.Expr<Path.EnvOf<Shape>, boolean>,
  options?: ProveOptions & {
    readonly hypotheses?: ReadonlyArray<Expr.Expr<Path.EnvOf<Shape>, boolean>>
  },
): Effect.Effect<Proof, SolverUnavailableError> =>
  Effect.map(
    refute(
      Object.entries(shape).map(([slice, schema]): Slice => [[slice], schema]),
      (options?.hypotheses ?? []).map(hypothesis => hypothesis.node),
      [goal.node],
      options,
      env => !holdsOf(goal.node, env),
    ),
    ({ verdict }) => verdict,
  )

const policyShape = <Row, Principal>(pol: {
  readonly rowSchema: Schema.Codec<Row>
  readonly principalSchema: Schema.Codec<Principal>
}) => ({ row: pol.rowSchema, principal: pol.principalSchema })

/**
 * Prove that `policy.rules[from]` (with the `row` and `principal` Schemas)
 * entails `policy.rules[to]`: non-disclosure is `Update => Read`.
 *
 * Runs Tier 3 first and asks Z3 where it is undecided. `False` carries a
 * replayed environment that `from` allows and `to` does not.
 */
export const policyImplies = <
  Row,
  Principal,
  Rules extends Readonly<Record<string, Expr.Expr<Policy.PolicyEnv<Row, Principal>, boolean>>>,
>(
  pol: Policy.Definition<Row, Principal, Rules>,
  from: keyof Rules & string,
  to: keyof Rules & string,
  options?: ProveOptions,
): Effect.Effect<Proof, SolverUnavailableError> => {
  const tier3 = Policy.checkImplication(pol, from, to)
  if (Verdict.isTrue(tier3)) return Effect.succeed(tier3)
  return policy(policyShape(pol), pol.rules[to]!, { ...options, hypotheses: [pol.rules[from]!] })
}

/**
 * Whether `policy.rules[rule]` can allow anything: `True` with a rule some
 * environment satisfies, `False` for a rule none does (a dead rule), and
 * `Unknown` where an opaque term or the solver leaves it undecided.
 */
export const policyConsistent = <
  Row,
  Principal,
  Rules extends Readonly<Record<string, Expr.Expr<Policy.PolicyEnv<Row, Principal>, boolean>>>,
>(
  pol: Policy.Definition<Row, Principal, Rules>,
  rule: keyof Rules & string,
  options?: ProveOptions,
): Effect.Effect<Proof, SolverUnavailableError> => {
  const tier3 = Policy.checkConsistent(pol, rule)
  if (Verdict.isFalse(tier3)) return Effect.succeed(Verdict.False(Option.none()))
  // An environment where the rule holds refutes "nothing satisfies it".
  return Effect.map(
    policy(policyShape(pol), Expr.lit(false), { ...options, hypotheses: [pol.rules[rule]!] }),
    reachable =>
      Verdict.match(reachable, {
        True: () => Verdict.False(Option.none()),
        False: () => Verdict.True(Option.some(Verdict.Proved('concrete'))),
        Unknown: unknown => unknown,
      }),
  )
}

/** Report returned by `Prove.policyAllConsistent`. */
export interface PolicyConsistencyReport<Rule extends string = string> {
  readonly ok: boolean
  readonly unreachable: ReadonlyArray<Rule>
  readonly verdicts: Readonly<Record<Rule, Proof>>
}

/**
 * Check consistency (reachability) of every rule in `pol`: `ok` is true only
 * when every rule is proved reachable (`True`); `unreachable` lists every rule
 * proved dead (`False`).
 */
export const policyAllConsistent = <
  Row,
  Principal,
  Rules extends Readonly<Record<string, Expr.Expr<Policy.PolicyEnv<Row, Principal>, boolean>>>,
>(
  pol: Policy.Definition<Row, Principal, Rules>,
  options?: ProveOptions,
): Effect.Effect<PolicyConsistencyReport<keyof Rules & string>, SolverUnavailableError> =>
  Effect.gen(function* () {
    const names = Object.keys(pol.rules) as Array<keyof Rules & string>
    const verdicts = {} as Record<keyof Rules & string, Proof>
    const unreachable: Array<keyof Rules & string> = []
    let ok = true
    for (const name of names) {
      const verdict = yield* policyConsistent(pol, name, options)
      verdicts[name] = verdict
      if (Verdict.isFalse(verdict)) {
        unreachable.push(name)
        ok = false
      } else if (!Verdict.isTrue(verdict)) {
        ok = false
      }
    }
    return { ok, unreachable, verdicts }
  })
