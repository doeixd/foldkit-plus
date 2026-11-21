/**
 * Static dependency graph, SSR live-frontier pruning, and dependent-query
 * readiness (`metakit/graph`).
 *
 * Browser code that only needs path matching should import `metakit/graph/match`
 * (which imports only `path.ts` and never loads `ops/residualize` or `sqlLowering`).
 */
import { Option } from 'effect'
import * as Expr from './expr.js'
import type { Machine } from './machine.js'
import { minimizePaths } from './graph/match.js'
import {
  build,
  knownEdge,
  modelPath,
  unknownEdge,
  type DependencyGraph,
  type PathEdge,
  type ReaderNode,
  type WriterNode,
} from './graph/structure.js'

export { affectedTags, minimizePaths, pathsOverlap, writesOverlapReads } from './graph/match.js'
export {
  addressesOverlap,
  build,
  formatAddress,
  knownEdge,
  modelPath,
  rowPath,
  unknownEdge,
  type DependencyGraph,
  type EdgeKnowledge,
  type OverlapReason,
  type PathAddress,
  type PathEdge,
  type ReaderKind,
  type ReaderNode,
  type RowToModelLink,
  type WriterKind,
  type WriterNode,
} from './graph/structure.js'
export { pruneStatic, type PrunedBindings } from './graph/prune.js'
export { queryReadiness, type QueryReadiness } from './graph/readiness.js'

export interface GraphAnalysis<
  Transitions extends Readonly<Record<string, unknown>>,
  Bindings extends Readonly<Record<string, unknown>>,
> {
  /** Underlying unified `DependencyGraph` built from `machine` and `bindings`. */
  readonly graph: DependencyGraph
  /** For each transition tag, the exact binding IDs invalidated when it fires. */
  readonly affectedBy: {
    readonly [K in keyof Transitions & string]: ReadonlyArray<keyof Bindings & string>
  }
  /** Static read footprint of each binding (`Option.none()` if unbounded `Opaque`). */
  readonly bindingReads: {
    readonly [B in keyof Bindings & string]: Option.Option<ReadonlyArray<ReadonlyArray<string>>>
  }
  /** Minimal set of `Model` paths read by any binding or read/written by any transition. */
  readonly liveModelPaths: Option.Option<ReadonlyArray<ReadonlyArray<string>>>
  /** Bindings that depend on no path written by any transition (provably static). */
  readonly deadBindings: ReadonlyArray<keyof Bindings & string>
}

/**
 * Thin call over `Graph.build` for a `Machine` and a record of named view
 * `Expr` bindings.
 */
export const analyze = <
  State,
  Transitions extends Readonly<Record<string, unknown>>,
  Bindings extends Readonly<Record<string, Expr.Expr<State, unknown>>>,
>(
  machine: Machine<State, Transitions>,
  bindings: Bindings,
): GraphAnalysis<Transitions, Bindings> => {
  const bindingIds = Object.keys(bindings) as Array<keyof Bindings & string>
  const bindingReadsMap: Record<string, Option.Option<ReadonlyArray<ReadonlyArray<string>>>> = {}
  const modelPaths: Array<ReadonlyArray<string>> = []
  let unboundedModel = false

  const readers: Array<ReaderNode> = []
  for (const id of bindingIds) {
    const r = Expr.reads(bindings[id]!)
    bindingReadsMap[id] = r
    if (Option.isNone(r)) {
      unboundedModel = true
      readers.push({ id, kind: 'binding', reads: [unknownEdge()] })
    } else {
      const readEdges: Array<PathEdge> = []
      for (const segs of r.value) {
        modelPaths.push(segs)
        readEdges.push(knownEdge(modelPath(segs), 'derived'))
      }
      readers.push({ id, kind: 'binding', reads: readEdges })
    }
  }

  const writers: Array<WriterNode> = []
  const tags: Array<string> = []
  for (const [tag, fp] of Object.entries(machine.footprints)) {
    tags.push(tag)
    const readEdges: Array<PathEdge> = []
    if (Option.isNone(fp.reads)) {
      unboundedModel = true
      readEdges.push(unknownEdge())
    } else {
      for (const segs of fp.reads.value) {
        if (segs[0] === 'state') {
          const modelSegs = segs.slice(1)
          modelPaths.push(modelSegs)
          readEdges.push(knownEdge(modelPath(modelSegs), 'derived'))
        }
      }
    }
    const writeEdges: Array<PathEdge> = []
    for (const w of fp.writes) {
      modelPaths.push(w)
      writeEdges.push(knownEdge(modelPath(w), 'derived'))
    }
    writers.push({ id: tag, kind: 'transition', writes: writeEdges, reads: readEdges })
  }

  const graph = build({ writers, readers })
  const affectedBy: Record<string, ReadonlyArray<string>> = {}
  for (const tag of tags) {
    affectedBy[tag] = graph.affectedBy(tag)
  }

  return {
    graph,
    affectedBy: affectedBy as GraphAnalysis<Transitions, Bindings>['affectedBy'],
    bindingReads: bindingReadsMap as GraphAnalysis<Transitions, Bindings>['bindingReads'],
    liveModelPaths: unboundedModel ? Option.none() : Option.some(minimizePaths(modelPaths)),
    deadBindings: graph.deadReaders() as ReadonlyArray<keyof Bindings & string>,
  }
}
