/**
 * What each core operation, each fold of a `Rows` node and each way of
 * writing keeps, as data: one table per kind, keyed by its closed set of
 * names, so a name with no row does not compile.
 *
 * A property is declared only where a generated check (`metakit/conformance`)
 * confirms it against the evaluator over the awkward values, and a reader
 * decides something from it:
 * - of an operation, partial evaluation reads `identity`, `absorbing`,
 *   `idempotent`, `reflexive` and `involution`; the checker's bounds read
 *   `monotone`; `commutative`, `associative` and `invertible` of `num.add`
 *   are read through the fold `sum` and the way `add`, which take them;
 * - of a fold, partial evaluation reads `absorbing` (a held list some of
 *   whose answers are unknown) and `monotone` of `any` and `every` (some of
 *   the related rows held); the checker reads `monotone` of `count` (a list
 *   `keep` leaves is no longer); `metakit/aggregates` keeps a total by
 *   deltas only over the domain where `sum` is commutative, associative and
 *   invertible, and starts it at `identity`;
 * - of a way of writing, `Transition.commutes` reads `commutes`.
 *
 * What partial evaluation reads is declared in `ops/laws.ts`, which a page
 * that judges carries; this module adds the rest, which only the checker,
 * `metakit/aggregates` and transitions read.
 */
import { Record } from 'effect'
import type * as Node from './node.js'
import { foldLaws, opLaws } from './ops/laws.js'

/** Which argument a value stands in: the first, the second, or either. */
export type Side = 'left' | 'right' | 'both'

/** Per argument: a larger value never gives a smaller answer (`up`), or never a larger one (`down`). */
export type Direction = 'up' | 'down'

/**
 * The values a property holds over: every value evaluation can meet, or the
 * safe integers (with null and a refusal). Addition of doubles rounds, so
 * grouping or undoing it changes the answer: `0.5 + 1e200 - 1e200` is 0.
 */
export type Domain = 'all' | 'integers'

/**
 * The closed set of seven properties, each an optional field, and two
 * rewrite rules partial evaluation alone reads (`reflexive`, `involution`).
 */
export interface OpProperties {
  /** `op(x, value)` is `x`, on `side`, for every `x` of the result's kind, null or refused. */
  readonly identity?: { readonly value: unknown; readonly side: Side }
  /**
   * `op(x, value)` is `result`, on `side`, for every `x`; `unlessRefused`:
   * for every `x` that is not refused, since a refusal is not absorbed.
   */
  readonly absorbing?: {
    readonly value: unknown
    readonly result: unknown
    readonly side: Side
    readonly unlessRefused?: true
  }
  /** Twice is once: `op(x, x)` is `x` for two arguments, `op(op(x))` is `op(x)` for one. */
  readonly idempotent?: true
  /** `op(x, y)` and `op(y, x)` give one answer, for every value. */
  readonly commutative?: true
  /**
   * `op(op(x, y), z)` and `op(x, op(y, z))` give one answer over `over`;
   * `unlessRefused`: where neither grouping is refused.
   */
  readonly associative?: { readonly over: Domain; readonly unlessRefused: boolean }
  /** `inverse(op(x, y), y)` is `x` over `over`, wherever `op(x, y)` has a value. */
  readonly invertible?: { readonly inverse: Node.CoreOpId; readonly over: Domain }
  /** One direction per argument. */
  readonly monotone?: ReadonlyArray<Direction>
  /** `op(x, x)` is `value` for an `x` that is a literal or a path and holds no NUL text. */
  readonly reflexive?: { readonly value: unknown }
  /** `op(op(x))` is `x` for every `x` of the result's kind, null or refused. */
  readonly involution?: true
}

/** What the checker, aggregates and transitions read of an operation, beside its laws. */
const algebra: {
  readonly [Id in Node.CoreOpId]?: Pick<
    OpProperties,
    'commutative' | 'associative' | 'invertible' | 'monotone'
  >
} = {
  'num.add': {
    commutative: true,
    associative: { over: 'integers', unlessRefused: true },
    invertible: { inverse: 'num.sub', over: 'integers' },
    monotone: ['up', 'up'],
  },
  'num.sub': { monotone: ['up', 'down'] },
  'num.neg': { monotone: ['down'] },
}

export const opProperties: { readonly [Id in Node.CoreOpId]: OpProperties } = Record.map(
  opLaws,
  (laws, id): OpProperties => ({ ...laws, ...algebra[id] }),
)

/** What a fold keeps, as it is read off the elements' answers. */
export interface FoldProperties {
  /** The operation the fold combines its elements' answers with, whose row it takes its properties from. */
  readonly from?: 'num.add' | 'bool.or' | 'bool.and'
  /** The answer over no element. */
  readonly identity?: { readonly value: unknown }
  /** One element whose test gives `value` decides the answer, `result`, whatever the others give. */
  readonly absorbing?: { readonly value: boolean; readonly result: unknown }
  /** The answer over the elements in any order is one, over `over`. */
  readonly commutative?: { readonly over: Domain }
  /** The answer over two lists joined is the answers over each combined by `from`, over `over`. */
  readonly associative?: { readonly over: Domain; readonly unlessRefused: boolean }
  /** An element's contribution is taken back out by `from`'s inverse, over `over`. */
  readonly invertible?: { readonly over: Domain }
  /** More elements never give a smaller answer (`up`), or never a larger one (`down`), where neither is refused. */
  readonly monotone?: Direction
}

const added = opProperties['num.add']

/**
 * What `sum` and `count` take from `num.add`: the order of the elements does
 * not matter where grouping does not, and the domain is the one both hold over.
 */
const summed = (over: Domain): FoldProperties => {
  // The narrower of the elements' domain and the one `num.add` holds over.
  const within = (holds: Domain): Domain => (holds === 'integers' ? 'integers' : over)
  const { identity, commutative, associative, invertible } = added
  return {
    from: 'num.add',
    ...(identity === undefined ? {} : { identity: { value: identity.value } }),
    ...(commutative === true && associative !== undefined
      ? {
          commutative: { over: within(associative.over) },
          associative: { over: within(associative.over), unlessRefused: associative.unlessRefused },
        }
      : {}),
    ...(invertible === undefined ? {} : { invertible: { over: within(invertible.over) } }),
  }
}

export const foldProperties: { readonly [Fold in Node.RowsFold]: FoldProperties } = {
  // The value that decides each, from `bool.or` and `bool.and` (`ops/laws.ts`).
  any: { from: 'bool.or', ...foldLaws.any },
  every: { from: 'bool.and', ...foldLaws.every },
  // A count adds 1 for each element that passes: integers, whatever the elements hold.
  count: { ...summed('integers'), monotone: 'up' },
  sum: summed('all'),
  min: {},
  max: {},
  find: {},
  keep: {},
  patch: {},
}

/** How a transition changes one path. */
export type WayOfWriting =
  | 'set'
  | 'add'
  | 'append'
  | 'insert'
  | 'remove'
  | 'removeWhere'
  | 'patch'
  | 'patchWhere'
  | 'include'
  | 'exclude'

/**
 * When two writes to one path give one state in either order:
 * - `always`;
 * - `one-kind`: both values are known to be text, or both numbers (a set
 *   refuses a member of the other kind, at whichever write meets it first);
 * - `same-literal`: both values are one literal;
 * - `different-literals`: the two values are literals that differ;
 * - `in-range`: the total and both amounts are integers, and the checker
 *   shows each total either order passes through stays in the safe range;
 * - `disjoint-fields`: the two set different fields, and neither's key, test
 *   or `set` reads a field the other sets;
 * - `steady`: no element can refuse either write (each key, key field, test
 *   and set is a value no operation refuses, as its Schema says), so neither
 *   removing what the other reads changes whether it is refused;
 * - `reads-no-set-field`: the removal's key or test reads no field the
 *   patch sets, and the patch is steady.
 */
export type CommuteCondition =
  | 'always'
  | 'one-kind'
  | 'same-literal'
  | 'different-literals'
  | 'in-range'
  | 'disjoint-fields'
  | 'steady'
  | 'reads-no-set-field'

export interface WriteProperties {
  /** The ways a write of this way commutes with on one path, and on what condition; any other does not decide. */
  readonly commutes: { readonly [Way in WayOfWriting]?: CommuteCondition }
}

/** Two `add`s commute where `num.add` is commutative and associative, over the integers it is associative over. */
const adds: WriteProperties['commutes'] =
  added.commutative === true && added.associative !== undefined ? { add: 'in-range' } : {}

const removals = { remove: 'steady', removeWhere: 'steady' } as const
const patches = { patch: 'reads-no-set-field', patchWhere: 'reads-no-set-field' } as const
const patchesEach = { patch: 'disjoint-fields', patchWhere: 'disjoint-fields' } as const

export const writeProperties: { readonly [Way in WayOfWriting]: WriteProperties } = {
  set: { commutes: { set: 'same-literal' } },
  add: { commutes: adds },
  // Order shows: an appended list says which came first.
  append: { commutes: {} },
  insert: { commutes: {} },
  remove: { commutes: { ...removals, ...patches } },
  removeWhere: { commutes: { ...removals, ...patches } },
  patch: {
    commutes: { ...patchesEach, remove: 'reads-no-set-field', removeWhere: 'reads-no-set-field' },
  },
  patchWhere: {
    commutes: { ...patchesEach, remove: 'reads-no-set-field', removeWhere: 'reads-no-set-field' },
  },
  include: { commutes: { include: 'one-kind', exclude: 'different-literals' } },
  exclude: { commutes: { exclude: 'one-kind', include: 'different-literals' } },
}
