/**
 * MetaKit — an `Env`-indexed calculus of inspectable expressions and
 * single-step transitions over Effect `Schema`.
 *
 * Built on a closed 15-operator v1 primitive set (`Node.CoreOpId`):
 * `Bool`, `Eq`, `Null`, `Ord`, `Num` (with derived helpers `min`, `max`,
 * `abs`, `clamp`, `between`, `isNotNull`, `implies` requiring zero extra
 * tier implementations).
 */
export * as Node from './node.js'
export * as Verdict from './verdict.js'
export * as Path from './path.js'
export * as Expr from './expr.js'
export * as Transition from './transition.js'
export * as Bool from './ops/bool.js'
export * as Eq from './ops/eq.js'
export * as Null from './ops/null.js'
export * as Ord from './ops/ord.js'
export * as Num from './ops/num.js'
export * as Str from './ops/str.js'
export * as Arr from './ops/arr.js'
export * as Interval from './abstract/interval.js'
export { Zone, ZERO } from './abstract/zone.js'
export * as Abstract from './abstract/check.js'
