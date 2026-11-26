/**
 * Set operations over scalar sets (held as arrays of finite numbers or
 * NUL-free strings): `union`, `intersect`, `difference`, `subset`, `disjoint`
 * (core primitives) plus derived helpers (`has`, `include`, `exclude`, `count`,
 * `isEmpty`, `nonEmpty`, `superset`, `equal`, `properSubset`, `overlaps`,
 * `symDiff`).
 *
 * Set-producing operations (`union`, `intersect`, `difference`, `symDiff`)
 * canonicalize to ascending unique order (matching `arr.include`/`arr.exclude`),
 * normalize `-0` to `0` and lone surrogates to `U+FFFD`, refuse NUL bytes
 * (`unportable`), non-finite numbers (`non-finite`), and mixed scalar kinds
 * (`ill-typed`), and are null-strict.
 */
import * as Node from '../node.js'
import type { Expr } from '../path.js'
import * as Arr from './arr.js'
import * as Bool from './bool.js'
import { call, type EnvOfInput, type ExprInput, type NullOf } from './core.js'
import { byCodePoint, wellFormed } from './str.js'

/** A scalar element a set may hold. */
export type SetElement = number | string

/** A set expression: an array of numbers or strings, possibly null. */
export type NullableSet<E extends SetElement = SetElement> = ExprInput<
  never,
  ReadonlyArray<E> | null
>

/** Element type of a set expression. */
export type SetElementOf<S> =
  S extends ExprInput<never, ReadonlyArray<infer E> | null>
    ? Extract<E, SetElement>
    : S extends ReadonlyArray<infer E>
      ? Extract<E, SetElement>
      : SetElement

const scalarOf = (id: Node.CoreOpId, value: unknown): number | string | Node.Refusal => {
  if (typeof value === 'string') {
    return Node.holdsNul([value]) ? Node.unportable(id) : wellFormed(value)
  }
  if (typeof value !== 'number') return Node.illTyped(id, 'a number or text', value)
  return Number.isFinite(value)
    ? value + 0
    : new Node.Refusal({ reason: 'non-finite', at: id, detail: `${value} in a set` })
}

const compareScalar = (a: number | string, b: number | string): number =>
  typeof a === 'number' && typeof b === 'number'
    ? Math.sign(a - b)
    : byCodePoint(a as string, b as string)

/** Validate and normalize both array operands to sorted unique scalar lists of one kind. */
const readPair = (
  id: Node.CoreOpId,
  rawA: unknown,
  rawB: unknown,
): readonly [ReadonlyArray<number | string>, ReadonlyArray<number | string>] | Node.Refusal => {
  if (!Array.isArray(rawA)) return Node.illTyped(id, 'an array', rawA)
  if (!Array.isArray(rawB)) return Node.illTyped(id, 'an array', rawB)
  let kind: 'number' | 'string' | undefined
  const parse = (items: ReadonlyArray<unknown>): Array<number | string> | Node.Refusal => {
    const out: Array<number | string> = []
    for (const item of items) {
      const scalar = scalarOf(id, item)
      if (Node.isRefusal(scalar)) return scalar
      const k = typeof scalar as 'number' | 'string'
      if (kind === undefined) kind = k
      else if (kind !== k) return Node.illTyped(id, `a ${kind} in a set of ${kind}s`, scalar)
      out.push(scalar)
    }
    return out
  }
  const a = parse(rawA)
  if (Node.isRefusal(a)) return a
  const b = parse(rawB)
  if (Node.isRefusal(b)) return b
  return [a, b]
}

const canonicalize = (items: ReadonlyArray<number | string>): ReadonlyArray<number | string> => {
  if (items.length <= 1) return [...items]
  const sorted = [...items].sort(compareScalar)
  const out: Array<number | string> = [sorted[0]!]
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] !== out[out.length - 1]) out.push(sorted[i]!)
  }
  return out
}

const nulRefusal =
  (id: Node.CoreOpId) =>
  (value: unknown): Node.Refusal | undefined =>
    Node.holdsNul([value]) ? Node.unportable(id) : undefined

export const unionOp: Node.Op<'set.union'> = {
  id: 'set.union',
  returns: 'operand',
  nulls: 'strict',
  refuses: nulRefusal('set.union'),
  evaluate: ([rawA, rawB]) => {
    const pair = readPair('set.union', rawA, rawB)
    if (Node.isRefusal(pair)) return pair
    const [a, b] = pair
    return canonicalize([...a, ...b])
  },
}

export const intersectOp: Node.Op<'set.intersect'> = {
  id: 'set.intersect',
  returns: 'operand',
  nulls: 'strict',
  refuses: nulRefusal('set.intersect'),
  evaluate: ([rawA, rawB]) => {
    const pair = readPair('set.intersect', rawA, rawB)
    if (Node.isRefusal(pair)) return pair
    const [a, b] = pair
    const inB = new Set(b)
    return canonicalize(a.filter(x => inB.has(x)))
  },
}

export const differenceOp: Node.Op<'set.difference'> = {
  id: 'set.difference',
  returns: 'operand',
  nulls: 'strict',
  refuses: nulRefusal('set.difference'),
  evaluate: ([rawA, rawB]) => {
    const pair = readPair('set.difference', rawA, rawB)
    if (Node.isRefusal(pair)) return pair
    const [a, b] = pair
    const inB = new Set(b)
    return canonicalize(a.filter(x => !inB.has(x)))
  },
}

export const subsetOp: Node.Op<'set.subset'> = {
  id: 'set.subset',
  returns: 'boolean',
  nulls: 'strict',
  refuses: nulRefusal('set.subset'),
  evaluate: ([rawA, rawB]) => {
    const pair = readPair('set.subset', rawA, rawB)
    if (Node.isRefusal(pair)) return pair
    const [a, b] = pair
    const inB = new Set(b)
    for (const x of a) if (!inB.has(x)) return false
    return true
  },
}

export const disjointOp: Node.Op<'set.disjoint'> = {
  id: 'set.disjoint',
  returns: 'boolean',
  nulls: 'strict',
  refuses: nulRefusal('set.disjoint'),
  evaluate: ([rawA, rawB]) => {
    const pair = readPair('set.disjoint', rawA, rawB)
    if (Node.isRefusal(pair)) return pair
    const [a, b] = pair
    const inB = new Set(b)
    for (const x of a) if (inB.has(x)) return false
    return true
  },
}

/** Companion set operand: allows empty `[]` alongside any scalar set while catching mixed scalar kinds. */
type MatchingSet<A extends NullableSet> = [SetElementOf<A>] extends [never]
  ? NullableSet
  : NullableSet<SetElementOf<A>>

type MergedElement<A extends NullableSet, B extends NullableSet> = SetElementOf<A> | SetElementOf<B>

/** Set union `A ∪ B` in canonical ascending unique order. */
export const union = <A extends NullableSet, B extends MatchingSet<A>>(
  a: A,
  b: B,
): Expr<
  EnvOfInput<A> & EnvOfInput<B>,
  ReadonlyArray<MergedElement<A, B>> | NullOf<A> | NullOf<B>
> => call(unionOp, [a, b])

/** Set intersection `A ∩ B` in canonical ascending unique order. */
export const intersect = <A extends NullableSet, B extends MatchingSet<A>>(
  a: A,
  b: B,
): Expr<
  EnvOfInput<A> & EnvOfInput<B>,
  ReadonlyArray<MergedElement<A, B>> | NullOf<A> | NullOf<B>
> => call(intersectOp, [a, b])

/** Set difference `A \ B` in canonical ascending unique order. */
export const difference = <A extends NullableSet, B extends MatchingSet<A>>(
  a: A,
  b: B,
): Expr<
  EnvOfInput<A> & EnvOfInput<B>,
  ReadonlyArray<MergedElement<A, B>> | NullOf<A> | NullOf<B>
> => call(differenceOp, [a, b])

/** True when every element of `a` is in `b` (`A ⊆ B`). */
export const subset = <A extends NullableSet, B extends MatchingSet<A>>(
  a: A,
  b: B,
): Expr<EnvOfInput<A> & EnvOfInput<B>, boolean | NullOf<A> | NullOf<B>> => call(subsetOp, [a, b])

/** True when `a` and `b` share no elements (`A ∩ B = ∅`). */
export const disjoint = <A extends NullableSet, B extends MatchingSet<A>>(
  a: A,
  b: B,
): Expr<EnvOfInput<A> & EnvOfInput<B>, boolean | NullOf<A> | NullOf<B>> => call(disjointOp, [a, b])

/** Insert `value` into set `s` (`S ∪ {x}`), canonical ascending unique order. */
export const include = <
  S extends NullableSet,
  V extends ExprInput<
    never,
    ([SetElementOf<S>] extends [never] ? SetElement : SetElementOf<S>) | null
  >,
>(
  s: S,
  value: V,
): Expr<
  EnvOfInput<S> & EnvOfInput<V>,
  | ReadonlyArray<SetElementOf<S> | Exclude<V extends ExprInput<never, infer X> ? X : never, null>>
  | NullOf<S>
> => call(Arr.includeOp, [s, value])

/** Remove `value` from set `s` (`S \ {x}`), canonical ascending unique order. */
export const exclude = <
  S extends NullableSet,
  V extends ExprInput<
    never,
    ([SetElementOf<S>] extends [never] ? SetElement : SetElementOf<S>) | null
  >,
>(
  s: S,
  value: V,
): Expr<EnvOfInput<S> & EnvOfInput<V>, ReadonlyArray<SetElementOf<S>> | NullOf<S>> =>
  call(Arr.excludeOp, [s, value])

/** True when `value` is a member of `s` (`x ∈ S`). */
export const has = Arr.has

/** Cardinality of `s` (`|S|`). */
export const count = Arr.count

/** True when `s` is empty (`S = ∅`). */
export const isEmpty = Arr.isEmpty

/** True when `s` is non-empty (`S ≠ ∅`). */
export const nonEmpty = Arr.nonEmpty

/** Derived helper: `A ⊇ B` (`subset(b, a)`). */
export const superset = <A extends NullableSet, B extends MatchingSet<A>>(
  a: A,
  b: B,
): Expr<EnvOfInput<A> & EnvOfInput<B>, boolean | NullOf<A> | NullOf<B>> => call(subsetOp, [b, a])

/** Derived helper: extensional set equality `A = B` (`A ⊆ B ∧ B ⊆ A`). */
export const equal = <A extends NullableSet, B extends MatchingSet<A>>(
  a: A,
  b: B,
): Expr<EnvOfInput<A> & EnvOfInput<B>, boolean | NullOf<A> | NullOf<B>> =>
  call(Bool.andOp, [call(subsetOp, [a, b]), call(subsetOp, [b, a])])

/** Derived helper: strict subset `A ⊂ B` (`A ⊆ B ∧ ¬(B ⊆ A)`). */
export const properSubset = <A extends NullableSet, B extends MatchingSet<A>>(
  a: A,
  b: B,
): Expr<EnvOfInput<A> & EnvOfInput<B>, boolean | NullOf<A> | NullOf<B>> =>
  call(Bool.andOp, [call(subsetOp, [a, b]), call(Bool.notOp, [call(subsetOp, [b, a])])])

/** Derived helper: `A` and `b` share at least one element (`A ∩ B ≠ ∅`). */
export const overlaps = <A extends NullableSet, B extends MatchingSet<A>>(
  a: A,
  b: B,
): Expr<EnvOfInput<A> & EnvOfInput<B>, boolean | NullOf<A> | NullOf<B>> =>
  call(Bool.notOp, [call(disjointOp, [a, b])])

/** Derived helper: symmetric difference `A △ B = (A \ B) ∪ (B \ A)`. */
export const symDiff = <A extends NullableSet, B extends MatchingSet<A>>(
  a: A,
  b: B,
): Expr<
  EnvOfInput<A> & EnvOfInput<B>,
  ReadonlyArray<MergedElement<A, B>> | NullOf<A> | NullOf<B>
> => call(unionOp, [call(differenceOp, [a, b]), call(differenceOp, [b, a])])
