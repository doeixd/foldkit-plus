/**
 * The kernel's functions over nodes (`@doeixd/metakit/build`), for a language written
 * on metakit that builds its own constructors: `foldkit-entity`'s `Expr`
 * builds metakit nodes through these.
 *
 * `wrap` types a node as an `Expr`, `toNode` takes an `Expr` or a literal to
 * its node, and `call` builds a call of a core or foreign operator.
 * `evalNode`, `residualizeNode`, `judgeNode` and `readsOfNode` are the
 * readers `Expr.evaluate`, `Expr.residualize`, `Expr.judge` and `Expr.reads`
 * run, over a node; `settleNode` is the value `judgeNode` decides from, for a
 * node that is not a predicate. `loadRows` loads the reading of a `Rows`
 * node, which a language that builds its own calls before it returns one.
 * `fractionBesideInteger` says whether SQL lowering refuses a node for a
 * fraction beside an integer term, for a reader that must refuse as SQL does.
 */
export { call, isExpr, toNode, wrap, type ExprInput } from './ops/core.js'
export { evalNode, type ForeignImplementation, type ForeignImplementations } from './ops/eval.js'
export { fractionBesideInteger } from './ops/integerTerm.js'
export { judgeNode, settleNode, Settled } from './ops/judge.js'
export { readsOfNode } from './ops/reads.js'
export { loadRows } from './ops/rowsLoad.js'
export { residualizeNode } from './ops/residualize.js'
