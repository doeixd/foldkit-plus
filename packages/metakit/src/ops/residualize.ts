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
import { Option, Schema, SchemaAST } from 'effect'
import * as Node from '../node.js'
import { applyForeign, evalNode, ifArm, matchArm, type ForeignImplementations } from './eval.js'
import { callCannotRefuse, cannotRefuse, isPortableRead, isSafeRead, kindOf } from './kind.js'
import {
  foreignCallCannotRefuse,
  nullBesideUnrefused,
  rewrite,
  rewriteForeign,
  type ForeignRewritePolicy,
  type View,
} from './laws.js'
import { lookupPartial } from './partial.js'
import { partialRows } from './partialRows.js'

const astOfNode = (node: Node.Node): Option.Option<SchemaAST.AST> =>
  Node.$is('Path')(node)
    ? node.ast
    : Node.$is('Call')(node) && Node.isForeign(node.op) && node.op.result !== undefined
      ? // A foreign call may evaluate to null (strict null propagation or implementation returning null).
        Option.some(Schema.NullOr(node.op.result).ast)
      : Option.none()

const baseView: View<Node.Node> = {
  known: node => (Node.$is('Lit')(node) ? Option.some(node.value) : Option.none()),
  kind: kindOf,
  cannotRefuse,
  isRead: Node.$is('Path'),
  isPortableRead,
  safe: isSafeRead,
  unary: node =>
    Node.$is('Call')(node) && node.args.length === 1
      ? {
          id: Node.isForeign(node.op) ? Node.foreignName(node.op) : node.op.id,
          arg: node.args[0]!,
        }
      : undefined,
  same: (left, right) => Node.key(left) === Node.key(right),
  ast: astOfNode,
}

const viewFor = (
  foreign: ForeignImplementations,
  rewritePolicy?: ForeignRewritePolicy,
): View<Node.Node> => {
  const nodeCannotRefuse = (node: Node.Node): boolean =>
    !Node.$is('Call')(node)
      ? cannotRefuse(node)
      : Node.isForeign(node.op)
        ? foreignCallCannotRefuse(residualView, node.op, node.args, foreign, rewritePolicy)
        : cannotRefuse(node) ||
          callCannotRefuse(
            node.op,
            node.args.map(arg => [nodeCannotRefuse(arg), kindOf(arg)] as const),
          )
  const residualView: View<Node.Node> = { ...baseView, cannotRefuse: nodeCannotRefuse }
  return residualView
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
  rewritePolicy?: ForeignRewritePolicy,
): Node.Node => {
  const residual = viewFor(foreign, rewritePolicy)
  const visit = (current: Node.Node, env: unknown): Node.Node =>
    Node.$match(current, {
      Lit: lit => lit,
      Path: path =>
        Option.match(lookupPartial(env, path.segments, path.ast), {
          onNone: () => path,
          onSome: value => Node.Lit({ value }),
        }),
      Call: ({ op, args }) => {
        const nextArgs = args.map(arg => visit(arg, env))
        if (nullBesideUnrefused(residual, op, nextArgs)) return Node.Lit({ value: null })
        if (Node.isForeign(op)) {
          const key = Node.foreignName(op)
          if (!Object.hasOwn(foreign, key)) return Node.Call({ op, args: nextArgs })
          if (nextArgs.every(Node.$is('Lit'))) {
            return Node.Lit({
              value: applyForeign(
                op,
                nextArgs.map(arg => arg.value),
                foreign,
              ),
            })
          }
          return Option.match(rewriteForeign(residual, op, nextArgs, foreign[key], rewritePolicy), {
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
        const cond = visit(branch.cond, env)
        if (Node.$is('Lit')(cond)) {
          const taken = ifArm(branch, evalNode(cond, undefined))
          return 'arm' in taken ? visit(taken.arm, env) : Node.Lit({ value: taken.value })
        }
        return Node.If({
          cond,
          then: visit(branch.then, env),
          otherwise: visit(branch.otherwise, env),
        })
      },
      Match: match => {
        const on = visit(match.on, env)
        if (Node.$is('Lit')(on)) {
          const taken = matchArm(match, evalNode(on, undefined))
          return 'arm' in taken ? visit(taken.arm, env) : Node.Lit({ value: taken.value })
        }
        return Node.Match({
          on,
          cases: match.cases.map(([value, arm]) => [value, visit(arm, env)] as const),
          otherwise: Option.map(match.otherwise, arm => visit(arm, env)),
        })
      },
      Opaque: opaque => {
        if (
          Option.isSome(opaque.reads) &&
          opaque.reads.value.every(segments =>
            Option.isSome(lookupPartial(env, segments, Option.none())),
          )
        ) {
          return Node.Lit({ value: opaque.run(env) })
        }
        return opaque
      },
      Rows: rows =>
        partialRows(
          rows,
          env,
          {
            judge: (inner, innerEnv) => visit(inner, innerEnv),
            known: residual.known,
            value: value => Node.Lit({ value }),
            kept: (kept, source, outer) =>
              Node.mapRows(
                kept,
                () => source,
                body => visit(body, outer),
              ),
          },
          segments => lookupPartial(env, segments, Option.none(), true),
          foreign,
        ),
    })
  return visit(node, partialEnv)
}
