/**
 * Minimal path-matching helpers (`metakit/graph/match`).
 *
 * Imports ONLY `../path.js` and `effect/Option` — zero `Expr`, zero
 * `ops/residualize`, and zero `sqlLowering` — so browser code (such as
 * `foldkit-surface/writes`) can match written paths against read paths at
 * view-definition time without pulling partial evaluation or SQL into a page.
 */
import { Option } from 'effect'
import * as Path from '../path.js'

/** True when `a` and `b` overlap in either direction (`a` is a prefix of `b` or `b` of `a`). */
export const pathsOverlap = (a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean =>
  Path.isPrefix(a, b) || Path.isPrefix(b, a)

/**
 * Deduplicate and prefix-minimize a list of paths: if `['account']` is present,
 * `['account', 'balance']` is subsumed and dropped. Deterministic order.
 */
export const minimizePaths = (
  paths: ReadonlyArray<ReadonlyArray<string>>,
): ReadonlyArray<ReadonlyArray<string>> => {
  const unique: Array<ReadonlyArray<string>> = []
  const seen = new Set<string>()
  for (const segs of paths) {
    const key = JSON.stringify(segs)
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(segs)
    }
  }
  return unique.filter(
    (candidate, i) =>
      !unique.some(
        (other, j) => i !== j && other.length < candidate.length && Path.isPrefix(other, candidate),
      ),
  )
}

/**
 * Whether a transition's `writes` can affect a reader with `reads`.
 *
 * - A transition with zero writes affects nothing.
 * - A reader with unknown reads (`Option.none()`) is conservatively affected by
 *   every transition that writes at least one path (never treated as empty).
 */
export const writesOverlapReads = (
  writes: ReadonlyArray<ReadonlyArray<string>>,
  reads: Option.Option<ReadonlyArray<ReadonlyArray<string>>>,
): boolean => {
  if (writes.length === 0) return false
  if (Option.isNone(reads)) return true
  return reads.value.some(r => writes.some(w => pathsOverlap(r, w)))
}

/**
 * Given a record of transition footprints `{ [Tag]: { writes } }` and a
 * reader's `reads` (`Option.none()` when unknown), return the tags whose
 * writes can affect that reader, in declaration order.
 */
export const affectedTags = <Tag extends string>(
  footprints: Readonly<Record<Tag, { readonly writes: ReadonlyArray<ReadonlyArray<string>> }>>,
  reads: Option.Option<ReadonlyArray<ReadonlyArray<string>>>,
): ReadonlyArray<Tag> => {
  const out: Array<Tag> = []
  for (const tag of Object.keys(footprints) as Array<Tag>) {
    if (writesOverlapReads(footprints[tag].writes, reads)) {
      out.push(tag)
    }
  }
  return out
}
