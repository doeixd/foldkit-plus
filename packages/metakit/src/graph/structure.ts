/**
 * Unified dependency graph structure (`metakit/graph`).
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

export interface WriterNode {
  readonly id: string
  readonly kind: WriterKind
  readonly writes: ReadonlyArray<PathEdge>
  readonly reads?: ReadonlyArray<PathEdge>
}

export interface ReaderNode {
  readonly id: string
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
 */
const trieQueryOverlap = <T>(
  root: TrieNode<T>,
  segments: ReadonlyArray<string>,
  out: Set<T>,
): void => {
  let node: TrieNode<T> | undefined = root
  for (const v of node.values) out.add(v)
  for (let i = 0; i < segments.length; i++) {
    node = node.children.get(segments[i]!)
    if (node === undefined) return
    // Ancestor values overlap; at the final segment we collect the entire subtree
    if (i < segments.length - 1) {
      for (const v of node.values) out.add(v)
    } else {
      collectSubtree(node, out)
    }
  }
}

export interface DependencyGraph {
  readonly writers: ReadonlyMap<string, WriterNode>
  readonly readers: ReadonlyMap<string, ReaderNode>
  readonly links: ReadonlyArray<RowToModelLink>
  /** Exact reader IDs invalidated when `writerId` runs (preserves reader declaration order). */
  readonly affectedBy: (writerId: string) => ReadonlyArray<string>
  /** Every reader whose reads overlap `path` (plus unknown readers). */
  readonly readersOf: (path: PathAddress) => ReadonlyArray<string>
  /** Every writer whose writes overlap `path` (plus unknown writers). */
  readonly writersOf: (path: PathAddress) => ReadonlyArray<string>
  /** Explain every reason `writerId` affects `readerId` (`[]` when disjoint). */
  readonly explain: (writerId: string, readerId: string) => ReadonlyArray<OverlapReason>
  /** Writers and readers carrying at least one `'unknown'` edge. */
  readonly unknowns: () => {
    readonly writers: ReadonlyArray<string>
    readonly readers: ReadonlyArray<string>
  }
  /** Readers unaffected by every writer in the graph. */
  readonly deadReaders: () => ReadonlyArray<string>
  /** Overlapping write-write or write-read edges between two writers. */
  readonly overlaps: (writerA: string, writerB: string) => ReadonlyArray<OverlapReason>
}

const isUnknownEdge = (edge: PathEdge): boolean =>
  edge.knowledge === 'unknown' || Option.isNone(edge.path)

/**
 * Build the indexed `DependencyGraph` once from writers, readers, and optional
 * `row -> model` bridge links.
 */
export const build = (config: {
  readonly writers: ReadonlyArray<WriterNode>
  readonly readers: ReadonlyArray<ReaderNode>
  readonly links?: ReadonlyArray<RowToModelLink>
}): DependencyGraph => {
  const writerMap = new Map<string, WriterNode>()
  const readerMap = new Map<string, ReaderNode>()
  const readerOrder: Array<string> = []
  const writerOrder: Array<string> = []
  const links = config.links ?? []

  const readerTrie = emptyTrie<string>()
  const writerTrie = emptyTrie<string>()
  const linkRowTrie = emptyTrie<RowToModelLink>()

  const unknownWriters = new Set<string>()
  const unknownReaders = new Set<string>()

  for (const link of links) {
    trieInsert(linkRowTrie, addressKeySegments(link.row), link)
  }

  for (const w of config.writers) {
    if (writerMap.has(w.id)) {
      throw new Error(`[metakit/graph] duplicate writer id "${w.id}"`)
    }
    writerMap.set(w.id, w)
    writerOrder.push(w.id)
    for (const edge of w.writes) {
      if (isUnknownEdge(edge)) {
        unknownWriters.add(w.id)
      } else if (Option.isSome(edge.path)) {
        trieInsert(writerTrie, addressKeySegments(edge.path.value), w.id)
      }
    }
  }

  for (const r of config.readers) {
    if (readerMap.has(r.id)) {
      throw new Error(`[metakit/graph] duplicate reader id "${r.id}"`)
    }
    readerMap.set(r.id, r)
    readerOrder.push(r.id)
    for (const edge of r.reads) {
      if (isUnknownEdge(edge)) {
        unknownReaders.add(r.id)
      } else if (Option.isSome(edge.path)) {
        trieInsert(readerTrie, addressKeySegments(edge.path.value), r.id)
      }
    }
  }

  const orderReaders = (set: ReadonlySet<string>): ReadonlyArray<string> =>
    readerOrder.filter(id => set.has(id))

  const orderWriters = (set: ReadonlySet<string>): ReadonlyArray<string> =>
    writerOrder.filter(id => set.has(id))

  const readersOf = (path: PathAddress): ReadonlyArray<string> => {
    const hit = new Set<string>(unknownReaders)
    trieQueryOverlap(readerTrie, addressKeySegments(path), hit)
    // Follow any row -> model bridge links overlapping `path`
    const bridged = new Set<RowToModelLink>()
    trieQueryOverlap(linkRowTrie, addressKeySegments(path), bridged)
    for (const link of bridged) {
      trieQueryOverlap(readerTrie, addressKeySegments(link.model), hit)
    }
    return orderReaders(hit)
  }

  const writersOf = (path: PathAddress): ReadonlyArray<string> => {
    const hit = new Set<string>(unknownWriters)
    trieQueryOverlap(writerTrie, addressKeySegments(path), hit)
    return orderWriters(hit)
  }

  const affectedBy = (writerId: string): ReadonlyArray<string> => {
    const w = writerMap.get(writerId)
    if (w === undefined || w.writes.length === 0) return []
    if (unknownWriters.has(writerId)) {
      // An unknown write can affect every reader in the graph
      return [...readerOrder]
    }
    const hit = new Set<string>(unknownReaders)
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
    return orderReaders(hit)
  }

  const explain = (writerId: string, readerId: string): ReadonlyArray<OverlapReason> => {
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
    writers: orderWriters(unknownWriters),
    readers: orderReaders(unknownReaders),
  })

  const deadReaders = (): ReadonlyArray<string> => {
    const everAffected = new Set<string>()
    for (const wId of writerOrder) {
      for (const rId of affectedBy(wId)) everAffected.add(rId)
    }
    return readerOrder.filter(id => !everAffected.has(id))
  }

  const overlaps = (writerA: string, writerB: string): ReadonlyArray<OverlapReason> => {
    const a = writerMap.get(writerA)
    const b = writerMap.get(writerB)
    if (a === undefined || b === undefined) return []
    const reasons: Array<OverlapReason> = []
    const checkPair = (writes: ReadonlyArray<PathEdge>, targets: ReadonlyArray<PathEdge>): void => {
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
      }
    }
    // Write-write overlap
    checkPair(a.writes, b.writes)
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
