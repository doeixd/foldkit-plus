/**
 * MetaKit — an `Env`-indexed calculus of inspectable expressions and
 * single-step transitions over Effect `Schema`.
 *
 * Page core (`metakit`): `Path`, `Expr`, `Transition`, `Verdict`, tree-shakeable
 * operators (`Bool`, `Eq`, `Num`, `Str`, `Struct`), and Tier 3 Interval + Zone
 * checks (`Abstract`, `Interval`, `Zone`).
 *
 * Server SQL lowering lives in `metakit/sql`; dev-only Z3 proving lives in
 * `metakit/prove`; Galois conformance property tests live in `metakit/conformance`.
 */
export * as Node from './node.js'
export * as Verdict from './verdict.js'
export * as Path from './path.js'
export * as Expr from './expr.js'
export * as Transition from './transition.js'
export * as Bool from './ops/bool.js'
export * as Eq from './ops/eq.js'
export * as Num from './ops/num.js'
export * as Str from './ops/str.js'
export * as Struct from './ops/struct.js'
export * as Interval from './abstract/interval.js'
export { Zone, ZERO } from './abstract/zone.js'
export * as Abstract from './abstract/check.js'
