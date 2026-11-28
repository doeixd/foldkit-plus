/**
 * The reference a judge of a partly known environment is held to
 * (`@doeixd/metakit/conformance`): the value and the verdict read off the expression
 * partial evaluation leaves (`residualizeNode`). `judgeNode` and
 * `settleNode` decide without building that expression; over every node and
 * environment they must answer as these do.
 */
import { Option } from 'effect'
import * as Node from './node.js'
import * as Path from './path.js'
import * as Verdict from './verdict.js'
import type { ForeignImplementations } from './ops/eval.js'
import { Settled } from './ops/judge.js'
import type { ForeignRewritePolicy } from './ops/laws.js'
import { readsOfNode } from './ops/reads.js'
import { residualizeNode } from './ops/residualize.js'

const hasOpaque = (node: Node.Node): boolean =>
  Node.$match(node, {
    Lit: () => false,
    Path: () => false,
    Call: ({ args }) => args.some(hasOpaque),
    If: ({ cond, then, otherwise }) => hasOpaque(cond) || hasOpaque(then) || hasOpaque(otherwise),
    Match: ({ on, cases, otherwise }) =>
      hasOpaque(on) ||
      cases.some(([, branch]) => hasOpaque(branch)) ||
      Option.match(otherwise, { onNone: () => false, onSome: hasOpaque }),
    Opaque: () => true,
    Rows: rows => [Node.rowsSource(rows.over), ...Node.rowsBody(rows)].some(hasOpaque),
  })

const foreignCalls = (node: Node.Node): ReadonlyArray<Node.ForeignOp> =>
  Node.$match(node, {
    Lit: () => [],
    Path: () => [],
    Call: ({ op, args }) => [...(Node.isForeign(op) ? [op] : []), ...args.flatMap(foreignCalls)],
    If: ({ cond, then, otherwise }) => [cond, then, otherwise].flatMap(foreignCalls),
    Match: ({ on, cases, otherwise }) =>
      [on, ...cases.map(([, branch]) => branch), ...Option.toArray(otherwise)].flatMap(
        foreignCalls,
      ),
    Opaque: () => [],
    Rows: rows => [Node.rowsSource(rows.over), ...Node.rowsBody(rows)].flatMap(foreignCalls),
  })

/** Why a residual that is not a literal is open: an opaque term, then a foreign call no implementation was given for, then what it reads. */
const openVerdict = (
  residual: Node.Node,
  foreign: ForeignImplementations,
): Verdict.Verdict<never> => {
  if (hasOpaque(residual)) {
    return Verdict.Unknown(
      'residual contains opaque term',
      Option.some({ kind: 'opaque', detail: 'residual contains an opaque function' }),
    )
  }
  const unimplemented = foreignCalls(residual).find(
    op => !Object.hasOwn(foreign, Node.foreignName(op)),
  )
  if (unimplemented !== undefined) {
    const named = Node.foreignName(unimplemented)
    return Verdict.Unknown(
      `no implementation of ${named}`,
      Option.some({ kind: 'unsupported', detail: named }),
    )
  }
  const missing = Option.match(readsOfNode(residual), {
    onNone: () => 'unknown environment reads',
    onSome: paths => paths.map(Path.format).join(', '),
  })
  return Verdict.Unknown(
    `missing environment: ${missing}`,
    Option.some({ kind: 'missing-env', detail: missing }),
  )
}

/** `settleNode`'s answer, read off the residual. */
export const residualSettled = (
  node: Node.Node,
  partialEnv: unknown,
  foreign: ForeignImplementations = {},
  rewritePolicy?: ForeignRewritePolicy,
): Settled => {
  const residual = residualizeNode(node, partialEnv, foreign, rewritePolicy)
  return Node.$is('Lit')(residual)
    ? Settled.Known({ value: residual.value })
    : Settled.Open({ reads: readsOfNode(residual), verdict: openVerdict(residual, foreign) })
}

/** `judgeNode`'s answer, read off the residual. */
export const residualVerdict = (
  node: Node.Node,
  partialEnv: unknown,
  foreign: ForeignImplementations = {},
  rewritePolicy?: ForeignRewritePolicy,
): Verdict.Verdict<never> => {
  const residual = residualizeNode(node, partialEnv, foreign, rewritePolicy)
  if (!Node.$is('Lit')(residual)) return openVerdict(residual, foreign)
  if (residual.value === true) return Verdict.True(Option.some(Verdict.Proved('concrete')))
  if (!Node.isRefusal(residual.value)) return Verdict.False<never>()
  return Verdict.Unknown(
    `evaluation refused: ${residual.value.message}`,
    Option.some({ kind: 'refused', detail: residual.value.message }),
  )
}
