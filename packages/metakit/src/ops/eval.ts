/**
 * Concrete evaluation of a `Node` against a complete environment.
 *
 * Uses each `Call`'s embedded `op.evaluate` directly, so evaluating an
 * expression never pulls unused operators into a bundle.
 */
import { Option } from 'effect'
import * as Node from '../node.js'

const readSegments = (env: unknown, segments: ReadonlyArray<string>): unknown => {
  let current: unknown = env
  for (const segment of segments) {
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

/** Evaluate `node` against a concrete `env`. */
export const evalNode = (node: Node.Node, env: unknown): unknown =>
  Node.$match(node, {
    Lit: ({ value }) => value,
    Path: ({ segments }) => readSegments(env, segments),
    Call: ({ op, args }) => op.evaluate(args.map(arg => evalNode(arg, env))),
    If: ({ cond, then, otherwise }) =>
      Boolean(evalNode(cond, env)) ? evalNode(then, env) : evalNode(otherwise, env),
    Match: ({ on, cases, otherwise }) => {
      const target = evalNode(on, env)
      for (const [value, branch] of cases) {
        if (target === value) return evalNode(branch, env)
      }
      return Option.match(otherwise, {
        onNone: () => undefined,
        onSome: fallback => evalNode(fallback, env),
      })
    },
    Opaque: ({ run }) => run(env),
  })
