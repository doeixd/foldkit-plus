/**
 * Tier 3 synchronous static checker over intervals and a Zone (difference
 * bounds), with case splits on `bool.or`, `If` and `Match`.
 *
 * It decides the value evaluation gives, under evaluation's own rule: an
 * operator over a null operand is null, an absent key reads as null, and
 * arithmetic past the safe range is refused. A verdict of `True` says the
 * goal evaluates to true in every environment the Schemas and hypotheses
 * allow, `False` that it evaluates to false in every one, and `Unknown`
 * anything else: a goal that may be null is never `True`, and its negation
 * is not either.
 */
import { Option, Schema } from 'effect'
import * as Expr from '../expr.js'
import * as Node from '../node.js'
import { notOp } from '../ops/bool.js'
import type { ForeignImplementations } from '../ops/eval.js'
import { isNullOp } from '../ops/null.js'
import * as Path from '../path.js'
import type { Transition, TransitionEnv } from '../transition.js'
import * as Verdict from '../verdict.js'
import { collectFields, pathKey, type FieldInfo } from './fields.js'
import { normalize } from './normalize.js'
import { AbstractState } from './state.js'
import { proved } from './support.js'

export { collectFields } from './fields.js'
export type { FieldInfo, FieldKind } from './fields.js'
export { abstractOps } from './ops.js'
export type { AbstractOp, PredicateOp, TermOp } from './ops.js'
export { AbstractState } from './state.js'

interface Write {
  readonly target: ReadonlyArray<string>
  readonly value: Node.Node
}

/** A read no checker can see into: part of a value the transition wrote as a whole. */
const unreadable = (segments: ReadonlyArray<string>): Node.Node =>
  Node.Opaque({
    name: `written:${Path.format(segments)}`,
    reads: Option.none(),
    run: () => null,
  })

/**
 * `node` over the state the writes leave: a read of a written path is its
 * value, a read under a written path is that part of its value, and a read
 * of a struct a write reaches into is one nothing here can follow.
 */
const afterWrites = (node: Node.Node, writes: ReadonlyArray<Write>): Node.Node =>
  Node.substitutePaths(node, segments => {
    if (segments[0] !== 'state') return Option.none()
    const read = segments.slice(1)
    for (const { target, value } of writes) {
      if (Path.isPrefix(target, read)) {
        const rest = read.slice(target.length)
        if (rest.length === 0) return Option.some(value)
        return Option.some(
          Node.$is('Path')(value)
            ? Node.Path({ segments: [...value.segments, ...rest], ast: Option.none() })
            : unreadable(segments),
        )
      }
      if (Path.isPrefix(read, target)) return Option.some(unreadable(segments))
    }
    return Option.none()
  })

/** The rules of `schema`, read under `under`. */
const rulesUnder = (schema: Schema.Top, under: ReadonlyArray<string>): ReadonlyArray<Node.Node> =>
  Expr.rulesOf(schema).map(rule => Node.prefix(rule.expr.node, under))

/**
 * `verdict`, except that a refutation by a state that left out an assumption
 * is `Unknown`: the counterexample may be one the dropped rule excludes. A
 * proof stays one, since it holds with fewer assumptions (#672).
 */
const unlessDropped = (state: AbstractState, verdict: Verdict.Verdict<never>) => {
  const [first] = state.dropped
  return first === undefined || !Verdict.isFalse(verdict)
    ? verdict
    : Verdict.Unknown(
        `refuted only without the rule it could not read: ${first.detail}`,
        Option.some(first),
      )
}

/** Tier 3 synchronous check: does `schema` entail `goal`? */
export const checkInvariant = <S extends Schema.Top>(
  schema: S,
  goal: Expr.Expr<S['Type'], boolean | null>,
  options?: { readonly foreign?: ForeignImplementations },
): Verdict.Verdict<never> => {
  const fields = new Map<string, FieldInfo>()
  collectFields(schema.ast, [], fields)
  const invariants = rulesUnder(schema, []).map(normalize)
  const target = normalize(goal.node)
  const state = new AbstractState([...invariants, target], fields, undefined, options?.foreign)
  for (const inv of invariants) state.assume(inv)
  return unlessDropped(state, state.entails(target))
}

/**
 * What a step of `transition` from a state `stateSchema` admits lets the
 * checker assume: the rules of the state, the input and the supplied values,
 * the guard, `extra`, and that no written value was refused. `goals` are
 * collected into the state's terms. None where the assumptions contradict,
 * so no step is taken.
 */
const stepState = <S extends Schema.Top, I, Emit, Sup>(
  stateSchema: S,
  transition: Transition<S['Type'], I, Emit, Sup>,
  extra: ReadonlyArray<Node.Node>,
  goals: (
    writes: ReadonlyArray<Write>,
    preInvariants: ReadonlyArray<Node.Node>,
  ) => ReadonlyArray<Node.Node>,
  foreign?: ForeignImplementations,
) => {
  const fields = new Map<string, FieldInfo>()
  collectFields(stateSchema.ast, ['state'], fields)
  const preInvariants = rulesUnder(stateSchema, ['state'])

  const otherInvariants: Array<Node.Node> = []
  const slices: ReadonlyArray<readonly [string, Option.Option<Schema.Top>]> = [
    ['input', transition.inputSchema],
    ['supplied', transition.suppliedSchema],
  ]
  for (const [slice, schema] of slices) {
    if (Option.isNone(schema)) continue
    collectFields(schema.value.ast, [slice], fields)
    otherInvariants.push(...rulesUnder(schema.value, [slice]))
  }

  const writes: ReadonlyArray<Write> = transition.writes.map(eq => ({
    target: eq.target,
    value: normalize(eq.value.node),
  }))
  const postGoals = goals(writes, preInvariants).map(normalize)
  // A write under a field that holds no value refuses the step (K3), so a step
  // taken has a value at every proper prefix of every target.
  const parentsPresent = writes.flatMap(({ target }) =>
    target.slice(0, -1).flatMap((_, at) => {
      const segments = ['state', ...target.slice(0, at + 1)]
      return fields.get(pathKey(segments))?.nullable === true
        ? [
            Node.Call({
              op: notOp,
              args: [
                Node.Call({ op: isNullOp, args: [Node.Path({ segments, ast: Option.none() })] }),
              ],
            }),
          ]
        : []
    }),
  )
  const hypotheses = [
    ...preInvariants,
    ...otherInvariants,
    transition.when.node,
    ...parentsPresent,
    ...extra,
  ].map(normalize)
  const state = new AbstractState(
    [...hypotheses, ...postGoals, ...writes.map(write => write.value)],
    fields,
    undefined,
    foreign,
  )
  for (const hypothesis of hypotheses) state.assume(hypothesis)
  // A write whose value is refused refuses the transition, so no state follows it.
  for (const write of writes) state.assumeEvaluated(write.value)
  return { state, fields, writes, postGoals, reachable: state.propagate() }
}

/** The environment a goal of `checkGoal` reads: a step's, and the state it leaves as `next`. */
export interface GoalEnv<State, Input, Supplied> extends TransitionEnv<State, Input, Supplied> {
  readonly next: State
}

/**
 * Tier 3 synchronous check of one goal about one step of `transition`: in
 * every step from a state `stateSchema` admits, with the input and supplied
 * values their Schemas admit, where the guard and each of `assume` hold, does
 * `goal` hold? `goal` reads the state before as `state` and the state the
 * writes leave as `next`.
 */
export const checkGoal = <S extends Schema.Top, I, Emit, Sup>(
  stateSchema: S,
  transition: Transition<S['Type'], I, Emit, Sup>,
  options: {
    readonly assume?: ReadonlyArray<Expr.Expr<TransitionEnv<S['Type'], I, Sup>, boolean | null>>
    readonly goal: Expr.Expr<GoalEnv<S['Type'], I, Sup>, boolean | null>
    readonly foreign?: ForeignImplementations
  },
): Verdict.Verdict<never> => {
  const { state, postGoals, reachable } = stepState(
    stateSchema,
    transition,
    (options.assume ?? []).map(each => each.node),
    writes => [
      Node.substitutePaths(options.goal.node, segments =>
        segments[0] === 'next'
          ? Option.some(
              afterWrites(
                Node.Path({ segments: ['state', ...segments.slice(1)], ast: Option.none() }),
                writes,
              ),
            )
          : Option.none(),
      ),
    ],
    options.foreign,
  )
  return reachable ? unlessDropped(state, state.entails(postGoals[0]!)) : proved('zone')
}

/**
 * Tier 3 synchronous check: does `transition` leave a state `stateSchema`
 * admits? Every rule on the Schema must hold of the state after the writes,
 * and every written value must be one its field's Schema takes: its type, its
 * bounds, whether it is an integer, a literal of its enumeration, or null.
 */
export const checkTransition = <S extends Schema.Top, I, Emit, Sup>(
  stateSchema: S,
  transition: Transition<S['Type'], I, Emit, Sup>,
  options?: { readonly foreign?: ForeignImplementations },
): Verdict.Verdict<never> => {
  const { state, fields, writes, postGoals, reachable } = stepState(
    stateSchema,
    transition,
    [],
    (writes, preInvariants) => preInvariants.map(inv => afterWrites(inv, writes)),
    options?.foreign,
  )
  if (!reachable) return proved('zone')

  let overall: Verdict.Verdict<never> = proved('zone')
  for (const { target, value } of writes) {
    const written = ['state', ...target]
    const inside = Array.from(fields.values()).filter(
      info =>
        info.kind !== 'struct' &&
        Path.isPrefix(written, info.segments) &&
        info.segments.length > written.length,
    )
    const whole = fields.get(pathKey(written))
    if (whole === undefined) return Verdict.Unknown(`no Schema for "${Path.format(written)}"`)
    if (inside.length === 0) {
      overall = Verdict.and(overall, state.fits(value, whole))
    } else if (Node.$is('Path')(value)) {
      // A struct written from a path: each field takes the field of the same name.
      if (!whole.nullable && !state.hasValue(value)) {
        return Verdict.Unknown(`"${Path.format(value.segments)}" may be null`)
      }
      for (const info of inside) {
        const part = Node.Path({
          segments: [...value.segments, ...info.segments.slice(written.length)],
          ast: Option.none(),
        })
        overall = Verdict.and(overall, state.fits(part, info))
      }
    } else {
      overall = Verdict.and(overall, state.fits(value, whole))
    }
    if (Verdict.isFalse(overall)) return unlessDropped(state, overall)
  }
  for (const goal of postGoals) {
    overall = Verdict.and(overall, state.entails(goal))
    if (Verdict.isFalse(overall)) break
  }
  return unlessDropped(state, overall)
}
