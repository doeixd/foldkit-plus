/**
 * The kernel's functions over nodes (`metakit/build`), for a language written
 * on metakit that builds its own constructors: `foldkit-entity`'s `Expr`
 * builds metakit nodes through these.
 *
 * `wrap` types a node as an `Expr`, `toNode` takes an `Expr` or a literal to
 * its node, and `call` builds a call of a core or foreign operator.
 * `evalNode`, `residualizeNode`, `judgeNode` and `readsOfNode` are the
 * readers `Expr.evaluate`, `Expr.residualize`, `Expr.judge` and `Expr.reads`
 * run, over a node.
 */
export { call, isExpr, toNode, wrap, type ExprInput } from './ops/core.js'
export { evalNode, type ForeignImplementation, type ForeignImplementations } from './ops/eval.js'
export { readsOfNode } from './ops/reads.js'
export { judgeNode, residualizeNode } from './ops/residualize.js'
