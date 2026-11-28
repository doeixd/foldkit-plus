import { Option } from 'effect'
import * as Node from '../node.js'
import * as Interval from './interval.js'
import type { AbstractState } from './state.js'
import { MAX_SPLITS } from './support.js'

/** The arm `value` takes, its text compared as evaluation compares it (`Node.textIdentity`). */
export const resolveMatchArm = (node: Node.Match, value: unknown): Option.Option<Node.Node> => {
  const held = Node.textIdentity(value)
  for (const [k, arm] of node.cases) {
    if (Node.wellFormed(k) === held) return Option.some(arm)
  }
  return node.otherwise
}

/**
 * The members of the literal set a path's Schema declares (a boolean's two
 * among them) that no fact rules out, its value where it has one. None where
 * the Schema declares no such set.
 */
export const literalsLeft = (
  state: AbstractState,
  pk: string,
): Option.Option<ReadonlyArray<string | number | boolean>> => {
  const info = state.fields.get(pk)
  if (info === undefined || Option.isNone(info.literals)) return Option.none()
  const excluded = state.neqFacts.get(pk)
  return Option.some(
    info.literals.value.filter(
      value => excluded === undefined || !excluded.has(Node.textIdentity(value)),
    ),
  )
}

/**
 * Finite candidate values for a `Path` field, including `null` whenever the
 * field may read as null (so case-splitting is sound for a nullable or
 * optional enumeration).
 */
export const matchCandidates = (
  state: AbstractState,
  pk: string,
): Option.Option<ReadonlyArray<string | number | boolean | null>> =>
  Option.flatMap(literalsLeft(state, pk), left => {
    const known = state.nullFacts.get(pk)
    const candidates = [
      ...(known === true ? [] : left),
      ...(state.fields.get(pk)!.nullable && known !== false ? [null] : []),
    ]
    return candidates.length === 0 || candidates.length > MAX_SPLITS
      ? Option.none()
      : Option.some(candidates)
  })

/** `state` with `pk` holding `candidate`. */
export const withCandidate = (
  state: AbstractState,
  pk: string,
  candidate: string | number | boolean | null,
): AbstractState => {
  const branch = state.clone()
  if (candidate === null) branch.nullFacts.set(pk, true)
  else {
    branch.eqFacts.set(pk, Node.textIdentity(candidate))
    branch.nullFacts.set(pk, false)
  }
  return branch
}

export const evalMatchInterval = (state: AbstractState, node: Node.Match): Interval.Interval => {
  const armInterval = (at: AbstractState, value: unknown): Interval.Interval =>
    // No arm: the match is null or refused, and has no number to bound.
    Option.match(resolveMatchArm(node, value), {
      onNone: () => Interval.bottom,
      onSome: arm => at.evalInterval(arm),
    })
  if (Node.$is('Lit')(node.on)) return armInterval(state, node.on.value ?? null)
  if (Node.$is('Path')(node.on)) {
    const pk = Node.key(node.on)
    if (state.nullFacts.get(pk) === true) return armInterval(state, null)
    if (state.eqFacts.has(pk)) return armInterval(state, state.eqFacts.get(pk))
    const candidates = matchCandidates(state, pk)
    if (Option.isSome(candidates)) {
      return candidates.value.reduce<Interval.Interval>((acc, candidate) => {
        const branch = withCandidate(state, pk, candidate)
        return branch.propagate() ? Interval.join(acc, armInterval(branch, candidate)) : acc
      }, Interval.bottom)
    }
  }
  return [...node.cases.map(([, arm]) => arm), ...Option.toArray(node.otherwise)].reduce(
    (acc, arm) => Interval.join(acc, state.evalInterval(arm)),
    Interval.bottom,
  )
}

export const findSplittableMatchPath = (
  state: AbstractState,
  node: Node.Node,
): Option.Option<string> => {
  const first = (nodes: ReadonlyArray<Node.Node>): Option.Option<string> =>
    Option.firstSomeOf(nodes.map(each => findSplittableMatchPath(state, each)))
  return Node.$match(node, {
    Lit: () => Option.none(),
    Path: () => Option.none(),
    Opaque: () => Option.none(),
    // A body reads its element, which no split of the state names.
    Rows: () => Option.none(),
    Call: ({ args }) => first(args),
    If: ({ cond, then, otherwise }) => first([cond, then, otherwise]),
    Match: ({ on, cases, otherwise }) => {
      if (Node.$is('Path')(on)) {
        const pk = Node.key(on)
        const open = !state.eqFacts.has(pk) && state.nullFacts.get(pk) !== true
        if (open && Option.isSome(matchCandidates(state, pk))) return Option.some(pk)
      }
      return first([...cases.map(([, arm]) => arm), ...Option.toArray(otherwise)])
    },
  })
}
