import { Option } from 'effect'
import * as Expr from '../expr.js'
import * as Node from '../node.js'
import { wrap } from '../ops/core.js'
import * as Verdict from '../verdict.js'

export const MAX_SPLITS = 8

export const proved = (tier: Verdict.ProofTier): Verdict.Verdict<never> =>
  Verdict.True(Option.some(Verdict.Proved(tier)))

export const refuted = (): Verdict.Verdict<never> => Verdict.False<never>()

/** The verdict on a negation: a refuted operand is a proof here, and says which tier gave it. */
export const negated = (verdict: Verdict.Verdict<never>): Verdict.Verdict<never> =>
  Verdict.match(verdict, {
    True: refuted,
    False: () => proved('zone'),
    Unknown: unknown => unknown,
  })

/** One answer for every case: `True` or `False` only where each case gives it. */
export const agree = (verdicts: ReadonlyArray<Verdict.Verdict<never>>): Verdict.Verdict<never> => {
  const [first, ...rest] = verdicts
  if (first === undefined) return proved('zone')
  if (Verdict.isUnknown(first)) return first
  return rest.every(verdict => verdict._tag === first._tag)
    ? first
    : (rest.find(Verdict.isUnknown) ?? Verdict.Unknown('the cases disagree'))
}

export const numberOf = (node: Node.Node): Option.Option<number> =>
  Node.$is('Lit')(node) && typeof node.value === 'number' ? Option.some(node.value) : Option.none()

export const show = (node: Node.Node): string => Expr.show(wrap(node))

/** A literal list of no candidate, among which `eq.among` is false whatever its value, read or not. */
export const noCandidate = (candidates: Node.Node | undefined): boolean =>
  candidates !== undefined &&
  Node.$is('Lit')(candidates) &&
  Array.isArray(candidates.value) &&
  candidates.value.length === 0

/** A literal that is not a refusal, or a path: a term evaluation reads and cannot refuse. */
export const isRead = (node: Node.Node): boolean =>
  Node.$is('Path')(node) || (Node.$is('Lit')(node) && !Node.isRefusal(node.value))
