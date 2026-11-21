/**
 * Partial evaluation (`residualizeNode`) over a partially known environment:
 * the expression left over, for the tools that read it (`Expr.residualize`,
 * the graph's pruning, SQL statements). A page that only needs a verdict or
 * a value runs `judgeNode` (`judge.ts`), which applies the same rules
 * (`laws.ts`) without building what is left.
 *
 * A call whose arguments are all known is evaluated; otherwise each
 * operator's row of `opLaws` shrinks it. A law is applied only where it holds
 * for every value evaluation can meet, null and a refusal included, so the
 * residual evaluates as the expression does on every completion of the
 * environment.
 *
 * Strictly separates epistemic `Unknown` (a missing environment slice or
 * opaque term) from object-level `null` (a known runtime value): `{ row: { x: null } }`
 * folds `row.x` to `Lit(null)`, never to `Unknown`.
 */
import { Option } from 'effect'
import * as Node from '../node.js'
import { applyForeign, evalNode, ifArm, matchArm, type ForeignImplementations } from './eval.js'
import { cannotRefuse, isPortableRead, kindOf } from './kind.js'
import { nullBesideUnrefused, rewrite, type View } from './laws.js'
import { lookupPartial } from './partial.js'
import { partialRows } from './partialRows.js'

/** A residual as the laws see it. */
const residual: View<Node.Node> = {
  known: node => (Node.$is('Lit')(node) ? Option.some(node.value) : Option.none()),
  kind: kindOf,
  cannotRefuse,
  isRead: Node.$is('Path'),
  isPortableRead,
  unary: node =>
    Node.$is('Call')(node) && node.args.length === 1
      ? { id: node.op.id, arg: node.args[0]! }
      : undefined,
  same: (left, right) => Node.key(left) === Node.key(right),
}

/**
 * Partially evaluate `node` against `partialEnv`, substituting known paths and
 * applying declarative size-reducing operator laws. A foreign call over
 * known arguments runs the implementation `foreign` gives, and stays a call
 * where it gives none.
 */
export const residualizeNode = (
  node: Node.Node,
  partialEnv: unknown,
  foreign: ForeignImplementations = {},
): Node.Node =>
  Node.$match(node, {
    Lit: lit => lit,
    Path: path =>
      Option.match(lookupPartial(partialEnv, path.segments, path.ast), {
        onNone: () => path,
        onSome: value => Node.Lit({ value }),
      }),
    Call: ({ op, args }) => {
      const nextArgs = args.map(arg => residualizeNode(arg, partialEnv, foreign))
      if (nullBesideUnrefused(residual, op, nextArgs)) return Node.Lit({ value: null })
      if (Node.isForeign(op)) {
        return nextArgs.every(Node.$is('Lit')) && Object.hasOwn(foreign, Node.foreignName(op))
          ? Node.Lit({
              value: applyForeign(
                op,
                nextArgs.map(arg => arg.value),
                foreign,
              ),
            })
          : Node.Call({ op, args: nextArgs })
      }
      if (nextArgs.every(Node.$is('Lit'))) {
        return Node.Lit({
          value: Node.apply(
            op,
            nextArgs.map(arg => arg.value),
          ),
        })
      }
      return Option.match(rewrite(residual, op, nextArgs), {
        onNone: () => Node.Call({ op, args: nextArgs }),
        onSome: (made): Node.Node =>
          'value' in made
            ? Node.Lit({ value: made.value })
            : 'call' in made
              ? Node.Call({
                  op: made.call,
                  args: [made.operand, Node.Lit({ value: made.literal })],
                })
              : made.operand,
      })
    },
    // No `if c then a else a -> a`: a null or refused `c` gives neither.
    If: branch => {
      const cond = residualizeNode(branch.cond, partialEnv, foreign)
      if (Node.$is('Lit')(cond)) {
        const taken = ifArm(branch, evalNode(cond, undefined))
        return 'arm' in taken
          ? residualizeNode(taken.arm, partialEnv, foreign)
          : Node.Lit({ value: taken.value })
      }
      return Node.If({
        cond,
        then: residualizeNode(branch.then, partialEnv, foreign),
        otherwise: residualizeNode(branch.otherwise, partialEnv, foreign),
      })
    },
    Match: match => {
      const on = residualizeNode(match.on, partialEnv, foreign)
      if (Node.$is('Lit')(on)) {
        const taken = matchArm(match, evalNode(on, undefined))
        return 'arm' in taken
          ? residualizeNode(taken.arm, partialEnv, foreign)
          : Node.Lit({ value: taken.value })
      }
      return Node.Match({
        on,
        cases: match.cases.map(
          ([value, arm]) => [value, residualizeNode(arm, partialEnv, foreign)] as const,
        ),
        otherwise: Option.map(match.otherwise, arm => residualizeNode(arm, partialEnv, foreign)),
      })
    },
    Opaque: opaque => {
      if (
        Option.isSome(opaque.reads) &&
        opaque.reads.value.every(segments =>
          Option.isSome(lookupPartial(partialEnv, segments, Option.none())),
        )
      ) {
        return Node.Lit({ value: opaque.run(partialEnv) })
      }
      return opaque
    },
    Rows: rows =>
      partialRows(
        rows,
        partialEnv,
        {
          judge: (inner, env) => residualizeNode(inner, env, foreign),
          known: residual.known,
          value: value => Node.Lit({ value }),
          kept: (kept, source, outer) =>
            Node.mapRows(
              kept,
              () => source,
              body => residualizeNode(body, outer, foreign),
            ),
        },
        segments => lookupPartial(partialEnv, segments, Option.none(), true),
      ),
  })
