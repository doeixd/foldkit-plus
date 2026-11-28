/**
 * Unified dependency graph structure (`@doeixd/metakit/graph`).
 *
 * One indexed graph built once at definition time over:
 *   - Unified `PathAddress`es (Model paths and stored-row entity fields, joined
 *     where a Remote read maps row fields into a Model path),
 *   - Writers (`transition`, `write`, `reducer`) and Readers (`projection`,
 *     `binding`, `placement`, `query`, `guard`, `rule`),
 *   - Three-way edge knowledge (`'derived' | 'declared' | 'unknown'`), where
 *     `'unknown'` is never treated as empty.
 *
 * Uses a prefix trie index so `affectedBy`, `readersOf`, and `writersOf`
 * look up overlapping ancestors and descendants without scanning all nodes.
 */
import { Option } from 'effect'
import * as Path from '../path.js'
import { pathsOverlap } from './match.js'

/** How a read or write edge was obtained. `'unknown'` is never treated as empty. */
export type EdgeKnowledge = 'derived' | 'declared' | 'unknown'

/** Unified address for both Model paths and stored-row fields. */
export type PathAddress =
  | {
      readonly kind: 'model'
      readonly segments: ReadonlyArray<string>
    }
  | {
      readonly kind: 'row'
      readonly entity: string
      readonly segments: ReadonlyArray<string>
    }

/** Construct a Model `PathAddress`. */
export const modelPath = (segments: ReadonlyArray<string>): PathAddress => ({
  kind: 'model',
  segments,
})

/** Construct a stored-row `PathAddress` for `entity` and field `segments`. */
export const rowPath = (entity: string, segments: ReadonlyArray<string>): PathAddress => ({
  kind: 'row',
  entity,
  segments,
})

/** Format a `PathAddress` for diagnostics and explanations. */
export const formatAddress = (addr: PathAddress): string =>
  addr.kind === 'model'
    ? `model:${Path.format(addr.segments)}`
    : `row:${addr.entity}.${Path.format(addr.segments)}`

const addressKeySegments = (addr: PathAddress): ReadonlyArray<string> =>
  addr.kind === 'model' ? ['model', ...addr.segments] : ['row', addr.entity, ...addr.segments]

/** True when two `PathAddress`es live in the same namespace and overlap by prefix. */
export const addressesOverlap = (a: PathAddress, b: PathAddress): boolean => {
  if (a.kind !== b.kind) return false
  if (a.kind === 'row' && b.kind === 'row' && a.entity !== b.entity) return false
  return pathsOverlap(a.segments, b.segments)
}

/** A single read or write edge. `path: Option.none()` with `knowledge: 'unknown'` is unbounded. */
export interface PathEdge {
  readonly path: Option.Option<PathAddress>
  readonly knowledge: EdgeKnowledge
}

/** Convenience constructor for a known `PathEdge`. */
export const knownEdge = (
  path: PathAddress,
  knowledge: 'derived' | 'declared' = 'derived',
): PathEdge => ({
  path: Option.some(path),
  knowledge,
})

/** Convenience constructor for an unbounded `'unknown'` edge. */
export const unknownEdge = (): PathEdge => ({
  path: Option.none(),
  knowledge: 'unknown',
})

export type WriterKind = 'transition' | 'write' | 'reducer'
export type ReaderKind = 'projection' | 'binding' | 'placement' | 'query' | 'guard' | 'rule'

export interface WriterNode<W extends string = string> {
  readonly id: W
  readonly kind: WriterKind
  readonly writes: ReadonlyArray<PathEdge>
  readonly reads?: ReadonlyArray<PathEdge>
}

export interface ReaderNode<R extends string = string> {
  readonly id: R
  readonly kind: ReaderKind
  readonly reads: ReadonlyArray<PathEdge>
}

/**
 * Bridge edge where a Remote read projects stored-row fields into a Model path
 * (so a write to `row` transitively affects readers under `model`).
 */
export interface RowToModelLink {
  readonly row: PathAddress
  readonly model: PathAddress
  readonly knowledge?: 'derived' | 'declared'
}

export type OverlapReason =
  | {
      readonly kind: 'direct'
      readonly write: PathEdge
      readonly read: PathEdge
    }
  | {
      readonly kind: 'bridged'
      readonly write: PathEdge
      readonly link: RowToModelLink
      readonly read: PathEdge
    }
  | {
      readonly kind: 'unknown-write'
      readonly write: PathEdge
    }
  | {
      readonly kind: 'unknown-read'
      readonly write: PathEdge
      readonly read: PathEdge
    }

interface TrieNode<T> {
  readonly values: Array<T>
  readonly children: Map<string, TrieNode<T>>
}

const emptyTrie = <T>(): TrieNode<T> => ({
  values: [],
  children: new Map(),
})

const trieInsert = <T>(root: TrieNode<T>, segments: ReadonlyArray<string>, value: T): void => {
  let node = root
  for (const seg of segments) {
    let next = node.children.get(seg)
    if (next === undefined) {
      next = emptyTrie<T>()
      node.children.set(seg, next)
    }
    node = next
  }
  node.values.push(value)
}

const collectSubtree = <T>(node: TrieNode<T>, out: Set<T>): void => {
  for (const v of node.values) out.add(v)
  for (const child of node.children.values()) collectSubtree(child, out)
}

/**
 * Find every indexed entry whose path overlaps `segments` (either an ancestor
 * prefix along the walk down, or any descendant in the subtree at `segments`).
 * `*` in either the query or an entry matches any one segment, so a concrete
 * query finds a wildcard entry and a wildcard query finds a concrete one.
 */
const trieQueryOverlap = <T>(
  root: TrieNode<T>,
  segments: ReadonlyArray<string>,
  out: Set<T>,
): void => {
  const visit = (node: TrieNode<T>, depth: number): void => {
    if (depth === segments.length) {
      collectSubtree(node, out)
      return
    }
    // A path ending here is an ancestor of the query, so it overlaps.
    for (const value of node.values) out.add(value)
    const segment = segments[depth]!
    if (segment === '*') {
      for (const child of node.children.values()) visit(child, depth + 1)
      return
    }
    const exact = node.children.get(segment)
    if (exact !== undefined) visit(exact, depth + 1)
    const wildcard = node.children.get('*')
    if (wildcard !== undefined && wildcard !== exact) visit(wildcard, depth + 1)
  }
  visit(root, 0)
}

export interface DependencyGraph<W extends string = string, R extends string = string> {
  readonly writers: ReadonlyMap<W, WriterNode<W>>
  readonly readers: ReadonlyMap<R, ReaderNode<R>>
  readonly links: ReadonlyArray<RowToModelLink>
  /** Exact reader IDs invalidated when `writerId` runs (preserves reader declaration order). */
  readonly affectedBy: (writerId: W) => ReadonlyArray<R>
  /** Every reader whose reads overlap `path` (plus unknown readers). */
  readonly readersOf: (path: PathAddress) => ReadonlyArray<R>
  /** Every writer whose writes overlap `path` (plus unknown writers). */
  readonly writersOf: (path: PathAddress) => ReadonlyArray<W>
  /** Explain every reason `writerId` affects `readerId` (`[]` when disjoint). */
  readonly explain: (writerId: W, readerId: R) => ReadonlyArray<OverlapReason>
  /** Writers and readers carrying at least one `'unknown'` edge. */
  readonly unknowns: () => {
    readonly writers: ReadonlyArray<W>
    readonly readers: ReadonlyArray<R>
  }
  /** Readers unaffected by every writer in the graph. */
  readonly deadReaders: () => ReadonlyArray<R>
  /** Overlapping write-write or write-read edges between two writers. */
  readonly overlaps: (writerA: W, writerB: W) => ReadonlyArray<OverlapReason>
}

const isUnknownEdge = (edge: PathEdge): boolean =>
  edge.knowledge === 'unknown' || Option.isNone(edge.path)

const orderHits = <Id>(
  hits: ReadonlySet<Id>,
  ranks: ReadonlyMap<Id, number>,
): ReadonlyArray<Id> => {
  const ids = [...hits]
  if (ids.length < 2) return ids
  // A dense lookup is cheaper to scan than to sort.
  if (ids.length * Math.log2(ids.length) >= ranks.size) {
    return [...ranks.keys()].filter(id => hits.has(id))
  }
  return ids.sort((left, right) => ranks.get(left)! - ranks.get(right)!)
}

/**
 * Build the indexed `DependencyGraph` once from writers, readers, and optional
 * `row -> model` bridge links.
 */
export const build = <const W extends string = string, const R extends string = string>(config: {
  readonly writers: ReadonlyArray<WriterNode<W>>
  readonly readers: ReadonlyArray<ReaderNode<R>>
  readonly links?: ReadonlyArray<RowToModelLink>
}): DependencyGraph<W, R> => {
  const writerMap = new Map<W, WriterNode<W>>()
  const readerMap = new Map<R, ReaderNode<R>>()
  const readerRanks = new Map<R, number>()
  const writerRanks = new Map<W, number>()
  const links = config.links ?? []

  const readerTrie = emptyTrie<R>()
  const writerTrie = emptyTrie<W>()
  const linkRowTrie = emptyTrie<RowToModelLink>()
  const linkModelTrie = emptyTrie<RowToModelLink>()

  const unknownWriteWriters = new Set<W>()
  const unknownAnyWriters = new Set<W>()
  const unknownReaders = new Set<R>()

  for (const link of links) {
    trieInsert(linkRowTrie, addressKeySegments(link.row), link)
    trieInsert(linkModelTrie, addressKeySegments(link.model), link)
  }

  for (const w of config.writers) {
    if (writerMap.has(w.id)) {
      throw new Error(`[metakit/graph] duplicate writer id "${w.id}"`)
    }
    writerMap.set(w.id, w)
    writerRanks.set(w.id, writerRanks.size)
    for (const edge of w.writes) {
      if (isUnknownEdge(edge)) {
        unknownWriteWriters.add(w.id)
        unknownAnyWriters.add(w.id)
      } else if (Option.isSome(edge.path)) {
        trieInsert(writerTrie, addressKeySegments(edge.path.value), w.id)
      }
    }
    for (const edge of w.reads ?? []) {
      if (isUnknownEdge(edge)) {
        unknownAnyWriters.add(w.id)
      }
    }
  }

  for (const r of config.readers) {
    if (readerMap.has(r.id)) {
      throw new Error(`[metakit/graph] duplicate reader id "${r.id}"`)
    }
    readerMap.set(r.id, r)
    readerRanks.set(r.id, readerRanks.size)
    for (const edge of r.reads) {
      if (isUnknownEdge(edge)) {
        unknownReaders.add(r.id)
      } else if (Option.isSome(edge.path)) {
        trieInsert(readerTrie, addressKeySegments(edge.path.value), r.id)
      }
    }
  }

  const readersOf = (path: PathAddress): ReadonlyArray<R> => {
    const hit = new Set<R>(unknownReaders)
    trieQueryOverlap(readerTrie, addressKeySegments(path), hit)
    // Follow any row -> model bridge links overlapping `path`
    const bridged = new Set<RowToModelLink>()
    trieQueryOverlap(linkRowTrie, addressKeySegments(path), bridged)
    for (const link of bridged) {
      trieQueryOverlap(readerTrie, addressKeySegments(link.model), hit)
    }
    return orderHits(hit, readerRanks)
  }

  const writersOf = (path: PathAddress): ReadonlyArray<W> => {
    const hit = new Set<W>(unknownWriteWriters)
    const segs = addressKeySegments(path)
    trieQueryOverlap(writerTrie, segs, hit)
    // Follow any row -> model bridge links whose model side overlaps `path`
    const bridged = new Set<RowToModelLink>()
    trieQueryOverlap(linkModelTrie, segs, bridged)
    for (const link of bridged) {
      trieQueryOverlap(writerTrie, addressKeySegments(link.row), hit)
    }
    return orderHits(hit, writerRanks)
  }

  const affectedBy = (writerId: W): ReadonlyArray<R> => {
    const w = writerMap.get(writerId)
    if (w === undefined || w.writes.length === 0) return []
    if (unknownWriteWriters.has(writerId)) {
      // An unknown write can affect every reader in the graph
      return [...readerRanks.keys()]
    }
    const hit = new Set<R>(unknownReaders)
    const bridged = new Set<RowToModelLink>()
    for (const edge of w.writes) {
      if (Option.isSome(edge.path)) {
        const segs = addressKeySegments(edge.path.value)
        trieQueryOverlap(readerTrie, segs, hit)
        trieQueryOverlap(linkRowTrie, segs, bridged)
      }
    }
    for (const link of bridged) {
      trieQueryOverlap(readerTrie, addressKeySegments(link.model), hit)
    }
    return orderHits(hit, readerRanks)
  }

  const explain = (writerId: W, readerId: R): ReadonlyArray<OverlapReason> => {
    const w = writerMap.get(writerId)
    const r = readerMap.get(readerId)
    if (w === undefined || r === undefined || w.writes.length === 0) return []
    const reasons: Array<OverlapReason> = []
    for (const we of w.writes) {
      if (isUnknownEdge(we)) {
        reasons.push({ kind: 'unknown-write', write: we })
        continue
      }
      const wp = we.path as Option.Some<PathAddress>
      for (const re of r.reads) {
        if (isUnknownEdge(re)) {
          reasons.push({ kind: 'unknown-read', write: we, read: re })
          continue
        }
        const rp = re.path as Option.Some<PathAddress>
        if (addressesOverlap(wp.value, rp.value)) {
          reasons.push({ kind: 'direct', write: we, read: re })
        }
      }
      // Bridged row -> model links
      for (const link of links) {
        if (!addressesOverlap(wp.value, link.row)) continue
        for (const re of r.reads) {
          if (Option.isSome(re.path) && addressesOverlap(link.model, re.path.value)) {
            reasons.push({ kind: 'bridged', write: we, link, read: re })
          }
        }
      }
    }
    return reasons
  }

  const unknowns = () => ({
    writers: orderHits(unknownAnyWriters, writerRanks),
    readers: orderHits(unknownReaders, readerRanks),
  })

  const deadReaders = (): ReadonlyArray<R> => {
    const everAffected = new Set<R>()
    for (const wId of writerRanks.keys()) {
      for (const rId of affectedBy(wId)) everAffected.add(rId)
    }
    return [...readerRanks.keys()].filter(id => !everAffected.has(id))
  }

  // The pair is put in one order first, so `overlaps(a, b)` and `overlaps(b, a)`
  // give the same reasons: a row write bridged into a Model path meets the
  // other writer's write from either side.
  const overlaps = (writerA: W, writerB: W): ReadonlyArray<OverlapReason> => {
    const [first, second] = writerA <= writerB ? [writerA, writerB] : [writerB, writerA]
    const a = writerMap.get(first)
    const b = writerMap.get(second)
    if (a === undefined || b === undefined) return []
    const reasons: Array<OverlapReason> = []
    const bridged = (we: PathEdge, wp: PathAddress, targets: ReadonlyArray<PathEdge>): void => {
      for (const link of links) {
        if (!addressesOverlap(wp, link.row)) continue
        for (const te of targets) {
          if (Option.isSome(te.path) && addressesOverlap(link.model, te.path.value)) {
            reasons.push({ kind: 'bridged', write: we, link, read: te })
          }
        }
      }
    }
    const checkPair = (writes: ReadonlyArray<PathEdge>, targets: ReadonlyArray<PathEdge>): void => {
      if (targets.length === 0) return
      for (const we of writes) {
        if (isUnknownEdge(we)) {
          reasons.push({ kind: 'unknown-write', write: we })
          continue
        }
        const wp = we.path as Option.Some<PathAddress>
        for (const te of targets) {
          if (isUnknownEdge(te)) {
            reasons.push({ kind: 'unknown-read', write: we, read: te })
            continue
          }
          const tp = te.path as Option.Some<PathAddress>
          if (addressesOverlap(wp.value, tp.value)) {
            reasons.push({ kind: 'direct', write: we, read: te })
          }
        }
        bridged(we, wp.value, targets)
      }
    }
    // Write-write overlap: direct and unknown reasons once, bridges from both sides.
    checkPair(a.writes, b.writes)
    if (a.writes.length > 0) {
      for (const we of b.writes) {
        if (!isUnknownEdge(we) && Option.isSome(we.path)) bridged(we, we.path.value, a.writes)
      }
    }
    // Write-read overlap in both directions
    if (b.reads !== undefined) checkPair(a.writes, b.reads)
    if (a.reads !== undefined) checkPair(b.writes, a.reads)
    return reasons
  }

  return {
    writers: writerMap,
    readers: readerMap,
    links,
    affectedBy,
    readersOf,
    writersOf,
    explain,
    unknowns,
    deadReaders,
    overlaps,
  }
}
