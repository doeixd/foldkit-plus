/**
 * The ways of writing and what each keeps (`writeProperties`), apart from
 * `properties.ts`, so a page that replays a pending write over a newer value
 * (`foldkit-remote`'s `replay.ts`) loads the rows it reads (`setWrites`,
 * `addWrites`) alone, without the operation and fold tables or what derives
 * them. `properties.ts` re-exports it and takes `num.add`'s row from here.
 */
import type { OpProperties } from '../properties.js'

/**
 * What `num.add` keeps beyond what evaluation reads: the ways of writing
 * derive from it, so it is declared beside them.
 */
export const added: Pick<OpProperties, 'commutative' | 'associative' | 'invertible' | 'monotone'> =
  {
    commutative: true,
    associative: { over: 'integers', unlessRefused: true },
    invertible: { inverse: 'num.sub', over: 'integers' },
    monotone: ['up', 'up'],
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

/**
 * The rows of `set` and `add`, exported apart: a page that asks only of these
 * two (`foldkit-remote`'s replay) keeps them and drops the rest of the table.
 */
export const setWrites: WriteProperties = { commutes: { set: 'same-literal' } }

/** Two `add`s commute where `num.add` is commutative and associative, over the integers it is associative over. */
export const addWrites: WriteProperties = {
  commutes:
    added.commutative === true && added.associative !== undefined ? { add: 'in-range' } : {},
}

// Literals, not spreads: a bundler keeps a spread for its getters, so the
// table would stay on a page that reads none of it.
const removals: WriteProperties = {
  commutes: {
    remove: 'steady',
    removeWhere: 'steady',
    patch: 'reads-no-set-field',
    patchWhere: 'reads-no-set-field',
  },
}
const patches: WriteProperties = {
  commutes: {
    patch: 'disjoint-fields',
    patchWhere: 'disjoint-fields',
    remove: 'reads-no-set-field',
    removeWhere: 'reads-no-set-field',
  },
}

export const writeProperties: { readonly [Way in WayOfWriting]: WriteProperties } = {
  set: setWrites,
  add: addWrites,
  // Order shows: an appended list says which came first.
  append: { commutes: {} },
  insert: { commutes: {} },
  remove: removals,
  removeWhere: removals,
  patch: patches,
  patchWhere: patches,
  include: { commutes: { include: 'one-kind', exclude: 'different-literals' } },
  exclude: { commutes: { exclude: 'one-kind', include: 'different-literals' } },
}
