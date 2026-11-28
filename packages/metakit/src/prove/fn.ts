/**
 * Formal Hoare-triple verification for `metakit/fn` (`Prove.fn`):
 * proves that for all `params` admitted by `fn.paramsSchema` satisfying `fn.where`,
 * `fn.body` never refuses, satisfies `fn.returns` (if declared), and satisfies every `fn.ensures`.
 */
import { Effect, Option, Result, Schema } from 'effect'
import type { Slice } from '../abstract/unordered.js'
import * as Expr from '../expr.js'
import type { Fn, ParamSchemas } from '../fn.js'
import * as Node from '../node.js'
import { notOp, orOp } from '../ops/bool.js'
import { coalesceOp, isNullOp } from '../ops/null.js'
import * as Path from '../path.js'
import type { ProveOptions } from '../prove.js'
import * as Verdict from '../verdict.js'
import { Unsupported } from './lower.js'
import { shapeOf } from './shape.js'
import { refute, type Proof, type SolverUnavailableError } from './solve.js'
import { project, writtenFits } from './transition.js'
import { at, holdsOf } from './witness.js'

const substituteResult = (node: Node.Node, resultNode: Node.Node): Node.Node =>
  Node.substitutePaths(node, segments => {
    if (segments[0] !== 'result') return Option.none()
    return Option.some(segments.length === 1 ? resultNode : project(resultNode, segments.slice(1)))
  })

const substituteRoot = (node: Node.Node, rootNode: Node.Node): Node.Node =>
  Node.substitutePaths(node, segments =>
    Option.some(segments.length === 0 ? rootNode : project(rootNode, segments)),
  )

/**
 * Prove that `fn` satisfies its Hoare contract for every input admitted by `fn.paramsSchema`
 * and `fn.where`: well-definedness (no refusal), `fn.returns` refinements/bounds, and `fn.ensures`.
 */
export const proveFn = <P extends ParamSchemas, R>(
  fn: Fn<P, R>,
  options?: ProveOptions,
): Effect.Effect<Proof, SolverUnavailableError> => {
  const slices: ReadonlyArray<Slice> = [[['params'], fn.paramsSchema]]
  const shape = shapeOf(slices)
  const bodyNode = Node.prefix(fn.body.node, ['params'])
  const given = fn.whereClauses.map(w => Node.prefix(w.node, ['params']))

  // Always require well-definedness: `isNull(body) || !isNull(body)` holds iff `body` never refuses.
  const isNullBody = Node.Call({ op: isNullOp, args: [bodyNode] })
  const definedGoal = Node.Call({
    op: orOp,
    args: [isNullBody, Node.Call({ op: notOp, args: [isNullBody] })],
  })

  const goals: Array<Node.Node> = [definedGoal]
  try {
    for (const ob of fn.obligations) {
      const obExpr = Node.prefix(ob.expr.node, ['params'])
      const obGoals: Array<Node.Node> = []
      const isNullOb = Node.Call({ op: isNullOp, args: [obExpr] })
      obGoals.push(
        Node.Call({
          op: orOp,
          args: [isNullOb, Node.Call({ op: notOp, args: [isNullOb] })],
        }),
      )
      if (Option.isSome(ob.schema)) {
        const obSchema = ob.schema.value
        const obShape = shapeOf([[[], obSchema]])
        const obInfo = obShape.paths.get('')
        if (obInfo !== undefined) {
          obGoals.push(...writtenFits(obInfo, obExpr, shape))
        }
        for (const rule of Expr.refinementsOf(obSchema)) {
          obGoals.push(substituteRoot(rule.node, obExpr))
        }
      }
      for (const e of ob.ensures) {
        obGoals.push(substituteResult(e.node, obExpr))
      }
      if (Option.isSome(ob.when)) {
        const rawGuard = Node.prefix(ob.when.value.node, ['params'])
        const guardNode = Node.Call({
          op: coalesceOp,
          args: [rawGuard, Node.Lit({ value: false })],
        })
        for (const g of obGoals) {
          goals.push(
            Node.If({
              cond: guardNode,
              then: g,
              otherwise: Node.Lit({ value: true }),
            }),
          )
        }
      } else {
        goals.push(...obGoals)
      }
    }
    if (Option.isSome(fn.returnSchema)) {
      const retSchema = fn.returnSchema.value
      const retShape = shapeOf([[[], retSchema]])
      const retInfo = retShape.paths.get('')
      if (retInfo !== undefined) {
        goals.push(...writtenFits(retInfo, bodyNode, shape))
      }
      for (const rule of Expr.refinementsOf(retSchema)) {
        goals.push(substituteRoot(rule.node, bodyNode))
      }
    }
    for (const e of fn.ensuresClauses) {
      goals.push(substituteResult(e.node, bodyNode))
    }
  } catch (error) {
    if (!(error instanceof Unsupported)) throw error
    return Effect.succeed(
      Verdict.Unknown(error.message, Option.some({ kind: 'unsupported', detail: error.message })),
    )
  }

  return Effect.map(
    refute(slices, given, goals, options, env => {
      const paramsVal = at(env, ['params']) as { readonly [K in keyof P]: P[K]['Type'] }
      for (const w of fn.whereClauses) {
        if (!holdsOf(w.node, paramsVal)) return false
      }
      const checked = fn.runChecked(paramsVal)
      return Result.isFailure(checked)
    }),
    ({ verdict }) => verdict,
  )
}
