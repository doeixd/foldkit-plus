/**
 * MetaKit — an `Env`-indexed calculus of inspectable expressions and
 * single-step transitions over Effect `Schema`.
 *
 * Built on a closed set of 33 primitive operators (`Node.CoreOpId`): `Bool`,
 * `Eq`, `Null`, `Ord`, `Num`, `Str` and `Arr`, with derived helpers (`min`,
 * `max`, `abs`, `clamp`, `between`, `isNotNull`, `implies`) that need no
 * tier implementation of their own, and one node kind, `Rows`, that asks a
 * question of each element of a list (`Arr.any`, `Arr.sum`, …).
 */
export * as Node from './node.js'
export * as Verdict from './verdict.js'
export * as Path from './path.js'
export type { EnvOf, PathAccessor } from './path.js'
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
export {
  foldProperties,
  foldPropertiesOf,
  opProperties,
  reduceProperties,
  type Direction,
  type Domain,
  type FoldProperties,
  type OpProperties,
  type Side,
} from './properties.js'
// From its own module, so a page reading it loads no other table.
export {
  addWrites,
  setWrites,
  writeProperties,
  type CommuteCondition,
  type IdempotentCondition,
  type WayOfWriting,
  type WriteProperties,
} from './ops/ways.js'
