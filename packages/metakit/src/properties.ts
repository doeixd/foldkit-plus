/**
 * What each core operation keeps, as data: one row per operation id, so an
 * operation with no row does not compile.
 *
 * A property is declared only where `checkProperties` (`metakit/conformance`)
 * confirms it against the evaluator over the awkward values, and a reader
 * decides something from it: partial evaluation reads `identity`,
 * `absorbing`, `idempotent`, `reflexive` and `involution`; the checker's
 * bounds read `monotone`.
 */
import type * as Node from './node.js'

/** Which argument a value stands in: the first, the second, or either. */
export type Side = 'left' | 'right' | 'both'

/** Per argument: a larger value never gives a smaller answer (`up`), or never a larger one (`down`). */
export type Direction = 'up' | 'down'

/**
 * The closed set of seven properties, each an optional field, and two
 * rewrite rules partial evaluation alone reads (`reflexive`, `involution`).
 */
export interface OpProperties {
  /** `op(x, value)` is `x`, on `side`, for every `x` of the result's kind, null or refused. */
  readonly identity?: { readonly value: unknown; readonly side: Side }
  /** `op(x, value)` is `result`, on `side`, for every `x`. */
  readonly absorbing?: { readonly value: unknown; readonly result: unknown; readonly side: Side }
  /** Twice is once: `op(x, x)` is `x` for two arguments, `op(op(x))` is `op(x)` for one. */
  readonly idempotent?: true
  /** `op(x, y)` and `op(y, x)` give one answer. */
  readonly commutative?: true
  /** `op(op(x, y), z)` and `op(x, op(y, z))` give one answer; `unless-refused`: where neither grouping is refused. */
  readonly associative?: 'always' | 'unless-refused'
  /** `inverse(op(x, y), y)` is `x` wherever `op(x, y)` has a value. */
  readonly invertible?: { readonly inverse: Node.CoreOpId }
  /** One direction per argument. */
  readonly monotone?: ReadonlyArray<Direction>
  /** `op(x, x)` is `value` for an `x` that is a literal or a path and holds no NUL text. */
  readonly reflexive?: { readonly value: unknown }
  /** `op(op(x))` is `x` for every `x` of the result's kind, null or refused. */
  readonly involution?: true
}

export const opProperties: { readonly [Id in Node.CoreOpId]: OpProperties } = {
  'bool.and': {
    identity: { value: true, side: 'both' },
    absorbing: { value: false, result: false, side: 'both' },
    idempotent: true,
  },
  'bool.or': {
    identity: { value: false, side: 'both' },
    absorbing: { value: true, result: true, side: 'both' },
    idempotent: true,
  },
  'bool.not': { involution: true },
  'eq.is': { reflexive: { value: true } },
  'eq.isNot': { reflexive: { value: false } },
  'eq.in': {},
  'null.isNull': {},
  'ord.lt': {},
  'ord.lte': {},
  'ord.gt': {},
  'ord.gte': {},
  'num.add': { identity: { value: 0, side: 'both' }, monotone: ['up', 'up'] },
  // No `x - x -> 0` and no `x * 0 -> 0`: over a null `x` each is null.
  'num.sub': { identity: { value: 0, side: 'right' }, monotone: ['up', 'down'] },
  'num.mul': { identity: { value: 1, side: 'both' } },
  'num.neg': { involution: true, monotone: ['down'] },
  'str.len': {},
  'str.startsWith': {},
  'str.contains': {},
  'arr.count': {},
  'arr.isEmpty': {},
}
