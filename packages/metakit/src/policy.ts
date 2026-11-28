/**
 * Declarative authorization policies (`metakit/policy`, browser & server safe).
 *
 * Keeps authority (`{ row, principal }`) strictly scoped apart from data
 * validity (`row` invariants): `Policy` rules can read both `row` and
 * `principal`, while `Schema` invariants can never reference `principal`.
 *
 * Supports runtime `allow`, partial-evaluation `can` (for UI/agent hints),
 * and synchronous Tier 3 Zone checks (`checkImplication`, `checkConsistent`).
 * For Tier 4 Z3 escalation and counterexample witnesses, pass a `Policy` to
 * `Prove.policyImplies` or `Prove.policyConsistent` in `metakit/prove`.
 */
import { Option, Pipeable, Result, type Schema } from 'effect'
import * as AbstractCheck from './abstract/check.js'
import { ordered, type Slice } from './abstract/unordered.js'
import * as Expr from './expr.js'
import * as Node from './node.js'
import * as Bool from './ops/bool.js'
import * as Path from './path.js'
import * as Verdict from './verdict.js'

export interface PolicyEnv<Row, Principal> {
  readonly row: Row
  readonly principal: Principal
}

/** The facts a checker consumes. Only the policy evaluator needs concrete principal decisions. */
export interface Definition<
  Row,
  Principal,
  Rules extends Readonly<Record<string, Expr.Expr<PolicyEnv<Row, Principal>, boolean>>>,
> {
  readonly rowSchema: Schema.Codec<Row>
  readonly principalSchema: Schema.Codec<Principal>
  readonly rules: Rules
}

const policyProto = /*#__PURE__*/ (() => ({
  pipe(this: unknown) {
    return Pipeable.pipeArguments(this, arguments)
  },
  toString(this: { readonly rules: Readonly<Record<string, unknown>> }) {
    return `Policy(${Object.keys(this.rules).join(', ')})`
  },
  [Symbol.for('nodejs.util.inspect.custom')](this: {
    readonly rules: Readonly<Record<string, unknown>>
  }) {
    return `Policy(${Object.keys(this.rules).join(', ')})`
  },
}))()

export interface Policy<
  Row,
  Principal,
  Rules extends Readonly<Record<string, Expr.Expr<PolicyEnv<Row, Principal>, boolean>>>,
>
  extends Definition<Row, Principal, Rules>, Pipeable.Pipeable {
  /** Evaluate a named policy rule against a concrete `{ row, principal }`. */
  readonly allow: <K extends keyof Rules & string>(
    rule: K,
    env: PolicyEnv<Row, Principal>,
  ) => boolean
  /** Partially evaluate a named policy rule against `{ row }`, `{ principal }`, or both. */
  readonly can: <K extends keyof Rules & string>(
    rule: K,
    partial: Expr.PartialEnv<PolicyEnv<Row, Principal>>,
  ) => Verdict.Verdict<never>
}

/**
 * Construct a typed authorization `Policy` over `{ row, principal }`.
 *
 * Rules are built with typed `PathAccessor`s for `row` and `principal`, and
 * may include `Expr.opaque` predicates for server-only principal checks.
 */
export const make = <
  SRow extends Schema.Top,
  SPrincipal extends Schema.Top,
  Rules extends Readonly<
    Record<string, Expr.Expr<PolicyEnv<SRow['Type'], SPrincipal['Type']>, boolean>>
  >,
>(config: {
  readonly row: SRow
  readonly principal: SPrincipal
  readonly rules: (env: {
    readonly row: Path.PathAccessor<PolicyEnv<SRow['Type'], SPrincipal['Type']>, SRow['Type']>
    readonly principal: Path.PathAccessor<
      PolicyEnv<SRow['Type'], SPrincipal['Type']>,
      SPrincipal['Type']
    >
  }) => Rules
}): Policy<SRow['Type'], SPrincipal['Type'], Rules> => {
  type Row = SRow['Type']
  type Principal = SPrincipal['Type']
  const envAccessors = Path.forEnv({ row: config.row, principal: config.principal }) as {
    readonly row: Path.PathAccessor<PolicyEnv<Row, Principal>, Row>
    readonly principal: Path.PathAccessor<PolicyEnv<Row, Principal>, Principal>
  }
  const rules = config.rules(envAccessors)

  const getRule = <K extends keyof Rules & string>(rule: K): Rules[K] => {
    if (!Object.hasOwn(rules, rule)) {
      throw new Error(`[metakit] Policy references unknown rule "${rule}"`)
    }
    return rules[rule]
  }

  return Object.assign(Object.create(policyProto) as Policy<Row, Principal, Rules>, {
    rowSchema: config.row as unknown as Schema.Codec<Row>,
    principalSchema: config.principal as unknown as Schema.Codec<Principal>,
    rules,
    // A rule allows only where it is true: not where it is null, and not where it is refused.
    allow: (rule: keyof Rules & string, env: PolicyEnv<Row, Principal>) =>
      Result.match(Expr.evalResult(getRule(rule), env), {
        onSuccess: value => value === true,
        onFailure: () => false,
      }),
    can: (rule: keyof Rules & string, partial: Expr.PartialEnv<PolicyEnv<Row, Principal>>) =>
      Expr.judge(getRule(rule), partial),
  })
}

/**
 * Tier 3 synchronous check: does `policy.rules[from]` (together with `row` and
 * `principal` schema invariants) entail `policy.rules[to]`?
 *
 * Typical use: non-disclosure (`Update => Read`). Returns `Verdict.True` when
 * proved synchronously in Zone/Interval, or `Verdict.Unknown` when Z3 is
 * needed (`Prove.policyImplies`).
 */
export const checkImplication = <
  Row,
  Principal,
  Rules extends Readonly<Record<string, Expr.Expr<PolicyEnv<Row, Principal>, boolean>>>,
>(
  policy: Definition<Row, Principal, Rules>,
  from: keyof Rules & string,
  to: keyof Rules & string,
): Verdict.Verdict<never> => {
  if (!Object.hasOwn(policy.rules, from)) {
    throw new Error(`[metakit] Policy.checkImplication unknown rule "${from}"`)
  }
  if (!Object.hasOwn(policy.rules, to)) {
    throw new Error(`[metakit] Policy.checkImplication unknown rule "${to}"`)
  }
  const fromRule = policy.rules[from]!
  const toRule = policy.rules[to]!
  const fields = new Map<string, AbstractCheck.FieldInfo>()
  AbstractCheck.collectFields(policy.rowSchema.ast, ['row'], fields)
  AbstractCheck.collectFields(policy.principalSchema.ast, ['principal'], fields)
  const hypotheses: Array<Node.Node> = [
    ...Expr.refinementsOf(policy.rowSchema).map(r => Node.prefix(r.node, ['row'])),
    ...Expr.refinementsOf(policy.principalSchema).map(r => Node.prefix(r.node, ['principal'])),
    fromRule.node,
  ]
  const state = new AbstractCheck.AbstractState([...hypotheses, toRule.node], fields)
  for (const h of hypotheses) state.assume(h)
  const verdict = state.entails(toRule.node)
  // Refuting a consequent under assumed facts does not establish a reachable antecedent.
  if (Verdict.isFalse(verdict))
    return Verdict.Unknown('a counterexample requires a reachable allow rule')
  return ordered(verdict, slicesOf(policy), [fromRule.node, toRule.node])
}

const slicesOf = (policy: {
  readonly rowSchema: Schema.Top
  readonly principalSchema: Schema.Top
}): ReadonlyArray<Slice> => [
  [['row'], policy.rowSchema],
  [['principal'], policy.principalSchema],
]

/**
 * Tier 3 synchronous check: is `policy.rules[rule]` provably dead
 * (unsatisfiable under the `row` and `principal` schema invariants)?
 *
 * Returns `Verdict.False` when the rule is provably unsatisfiable (dead allow
 * rule), or `Verdict.Unknown` otherwise (use `Prove.policyConsistent` for a
 * concrete satisfying witness or Z3 unsatisfiability proof).
 */
export const checkConsistent = <
  Row,
  Principal,
  Rules extends Readonly<Record<string, Expr.Expr<PolicyEnv<Row, Principal>, boolean>>>,
>(
  policy: Definition<Row, Principal, Rules>,
  rule: keyof Rules & string,
): Verdict.Verdict<never> => {
  if (!Object.hasOwn(policy.rules, rule)) {
    throw new Error(`[metakit] Policy.checkConsistent unknown rule "${rule}"`)
  }
  const target = policy.rules[rule]!
  const fields = new Map<string, AbstractCheck.FieldInfo>()
  AbstractCheck.collectFields(policy.rowSchema.ast, ['row'], fields)
  AbstractCheck.collectFields(policy.principalSchema.ast, ['principal'], fields)
  const hypotheses: Array<Node.Node> = [
    ...Expr.refinementsOf(policy.rowSchema).map(r => Node.prefix(r.node, ['row'])),
    ...Expr.refinementsOf(policy.principalSchema).map(r => Node.prefix(r.node, ['principal'])),
    target.node,
  ]
  const state = new AbstractCheck.AbstractState(hypotheses, fields)
  for (const h of hypotheses) state.assume(h)
  const dead = () => ordered(Verdict.False<never>(), slicesOf(policy), [target.node])
  if (!state.propagate()) {
    return dead()
  }
  const notTarget = Bool.not(target)
  const baseHypotheses: Array<Node.Node> = [
    ...Expr.refinementsOf(policy.rowSchema).map(r => Node.prefix(r.node, ['row'])),
    ...Expr.refinementsOf(policy.principalSchema).map(r => Node.prefix(r.node, ['principal'])),
  ]
  const base = new AbstractCheck.AbstractState([...baseHypotheses, notTarget.node], fields)
  for (const h of baseHypotheses) base.assume(h)
  if (Verdict.isTrue(base.entails(notTarget.node))) {
    return dead()
  }
  return Verdict.Unknown(
    `Tier 3 could not prove "${rule}" unsatisfiable; escalate to Prove.policyConsistent for a witness`,
    Option.none(),
  )
}
