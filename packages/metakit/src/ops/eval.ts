/**
 * Concrete evaluation of a `Node` against a complete environment.
 *
 * Null-strict, as SQL is: an absent key reads as null, an operator over a null
 * operand gives null unless it says otherwise (`Node.Op.nulls`), and a
 * condition that is null chooses neither branch. The result is a value, null,
 * or a `Node.Refusal`. Uses each `Call`'s embedded `op.evaluate` directly, so
 * evaluating an expression never pulls unused operators into a bundle.
 */
import { Option } from 'effect'
import * as Node from '../node.js'

const readSegments = (env: unknown, segments: ReadonlyArray<string>): unknown => {
  let current: unknown = env
  for (const segment of segments) {
    if (
      current === null ||
      current === undefined ||
      typeof current !== 'object' ||
      !Object.hasOwn(current, segment)
    ) {
      return null
    }
    current = (current as Record<string, unknown>)[segment]
  }
  return current === undefined ? null : current
}

/**
 * The branch of `match` that `target` takes: null where there is no fallback
 * and the target is null, a refusal where no case names it.
 */
export const matchArm = (
  match: Node.Match,
  target: unknown,
): { readonly arm: Node.Node } | { readonly value: null | Node.Refusal } => {
  if (Node.isRefusal(target)) return { value: target }
  for (const [value, arm] of match.cases) {
    if (target === value) return { arm }
  }
  if (Option.isSome(match.otherwise)) return { arm: match.otherwise.value }
  if (target === null) return { value: null }
  return {
    value: new Node.Refusal({
      reason: 'unmatched',
      at: 'match',
      detail: `no case names ${JSON.stringify(target)}`,
    }),
  }
}

/** The branch of `node` a condition's value takes, as `matchArm` gives a match's. */
export const ifArm = (
  node: Node.If,
  cond: unknown,
): { readonly arm: Node.Node } | { readonly value: null | Node.Refusal } => {
  if (cond === true) return { arm: node.then }
  if (cond === false) return { arm: node.otherwise }
  if (cond === null || Node.isRefusal(cond)) return { value: cond }
  return { value: Node.illTyped('if', 'a boolean', cond) }
}

/** Evaluate `node` against a concrete `env`: a value, null, or a `Node.Refusal`. */
export const evalNode = (node: Node.Node, env: unknown): unknown =>
  Node.$match(node, {
    Lit: ({ value }) => (value === undefined ? null : value),
    Path: ({ segments }) => readSegments(env, segments),
    Call: ({ op, args }) =>
      Node.apply(
        op,
        args.map(arg => evalNode(arg, env)),
      ),
    If: node => {
      const taken = ifArm(node, evalNode(node.cond, env))
      return 'arm' in taken ? evalNode(taken.arm, env) : taken.value
    },
    Match: node => {
      const taken = matchArm(node, evalNode(node.on, env))
      return 'arm' in taken ? evalNode(taken.arm, env) : taken.value
    },
    Opaque: ({ run }) => {
      const value = run(env)
      return value === undefined ? null : value
    },
  })
