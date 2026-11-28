/**
 * `liveSet` (Phase 6, Bout 6.3, server-only): what a server-drawn page's bound
 * Messages can actually change, closed over `GraphEdge.Sends`.
 *
 * Given a `ResumePlan` and the application's `Graph`:
 *   - `messages`: the bound/exposed Messages on the page, closed over `Sends`.
 *   - `writes`: minimal Model paths written by any live Message.
 *   - `reads`: minimal Model paths read by any live Message or by any reader
 *     affected by a live Message — only these need to cross in the envelope.
 *   - `deadReaders`: readers in `graph.dependencies` no live Message reaches
 *     (unchanging on this page).
 */
import { Option, type Schema } from 'effect'
import { GraphEdge, type Graph } from 'foldkit-surface'
import { covers, minimizePaths, pathsOverlap } from '@doeixd/metakit/graph/match'
import type { ResumePlan } from './shared.js'

/** What a page's bound Messages can reach, computed on the server from `Graph.of`. */
export interface LiveSet<Tag extends string = string> {
  /** Every Message tag reachable from the plan's bound Messages, closed over `GraphEdge.Sends`. */
  readonly messages: ReadonlySet<Tag>
  /** Minimal Model paths written by any live Message. */
  readonly writes: ReadonlyArray<ReadonlyArray<string>>
  /** Minimal Model paths read by any live Message or any reader a live Message affects. */
  readonly reads: ReadonlyArray<ReadonlyArray<string>>
  /** Reader IDs in `graph.dependencies` that no live Message reaches. */
  readonly deadReaders: ReadonlyArray<string>
  /** True when any live Message has unknown writes (or no writer entry in the graph). */
  readonly unbounded: boolean
}

export interface LiveSetOptions<Tag extends string = string> {
  /** Explicit bound Message tags on this page (in addition to `plan.surfaces`'s messages). */
  readonly messages?: ReadonlyArray<Tag> | undefined
}

const stripMessagePrefix = (id: string): string =>
  id.startsWith('message:')
    ? id.slice('message:'.length)
    : id.startsWith('durable:')
      ? id.slice('durable:'.length)
      : id

/**
 * Compute the live set of a page from its `ResumePlan` and `Graph`.
 *
 * Unknown writes are never treated as empty: if a live Message has no writer
 * node in `graph.dependencies` or carries an `'unknown'` write edge,
 * `unbounded` is `true`, `deadReaders` is empty, and every reader's known
 * Model paths are included in `reads`.
 */
export const liveSet = <
  Model,
  Fields extends Schema.Struct.Fields,
  W extends string = string,
  R extends string = string,
>(
  plan: Pick<ResumePlan<Model, Fields>, 'surfaces'>,
  graph: Graph<W, R>,
  options?: LiveSetOptions<string>,
): LiveSet<string> => {
  const messages = new Set<string>(options?.messages ?? [])
  for (const source of plan.surfaces) {
    if ('messages' in source && Array.isArray(source.messages)) {
      for (const tag of source.messages) messages.add(tag)
    }
  }

  // Close `messages` over `GraphEdge.Sends` (fixed-point BFS; cycles visited once).
  const sends = new Map<string, Array<string>>()
  for (const edge of graph.edges) {
    if (!GraphEdge.$is('Sends')(edge)) continue
    const from = stripMessagePrefix(edge.from)
    const to = stripMessagePrefix(edge.to)
    const existing = sends.get(from)
    if (existing === undefined) sends.set(from, [to])
    else existing.push(to)
  }
  for (const tag of messages) {
    for (const next of sends.get(tag) ?? []) messages.add(next)
  }

  const rawWrites: Array<ReadonlyArray<string>> = []
  const rawReads: Array<ReadonlyArray<string>> = []
  const liveWriterIds: Array<W> = []
  let unbounded = false

  const deps = graph.dependencies
  const writerIdByKey = new Map<string, W>()
  for (const id of deps.writers.keys()) writerIdByKey.set(id, id)

  for (const tag of messages) {
    let foundWriter = false
    for (const candidate of [`message:${tag}`, `durable:${tag}`]) {
      const writerId = writerIdByKey.get(candidate)
      if (writerId === undefined) continue
      const writer = deps.writers.get(writerId)
      if (writer === undefined) continue
      foundWriter = true
      liveWriterIds.push(writerId)
      for (const edge of writer.writes) {
        if (edge.knowledge === 'unknown' || Option.isNone(edge.path)) {
          unbounded = true
        } else if (edge.path.value.kind === 'model') {
          rawWrites.push(edge.path.value.segments)
        }
      }
      for (const edge of writer.reads ?? []) {
        if (edge.knowledge === 'unknown' || Option.isNone(edge.path)) {
          unbounded = true
        } else if (edge.path.value.kind === 'model') {
          rawReads.push(edge.path.value.segments)
        }
      }
    }
    if (!foundWriter) {
      unbounded = true
    }
  }

  const affected = new Set<string>()
  if (unbounded) {
    for (const readerId of deps.readers.keys()) affected.add(readerId)
  } else {
    for (const writerId of liveWriterIds) {
      for (const readerId of deps.affectedBy(writerId)) affected.add(readerId)
    }
  }

  const deadReaders: Array<string> = []
  for (const [readerId, reader] of deps.readers.entries()) {
    if (!affected.has(readerId)) {
      deadReaders.push(readerId)
      continue
    }
    for (const edge of reader.reads) {
      if (edge.knowledge === 'unknown' || Option.isNone(edge.path)) {
        unbounded = true
      } else if (edge.path.value.kind === 'model') {
        rawReads.push(edge.path.value.segments)
      }
    }
  }

  return {
    messages,
    writes: minimizePaths(rawWrites),
    reads: minimizePaths(rawReads),
    deadReaders,
    unbounded,
  }
}

/** True when `path` is unchanging under `live` (never read by any live Message or affected reader). */
export const isUnchangingPath = (path: ReadonlyArray<string>, live: LiveSet<string>): boolean => {
  if (live.unbounded || path.length === 0) return false
  return (
    !live.reads.some(livePath => pathsOverlap(livePath, path)) &&
    !live.writes.some(writePath => covers(writePath, path) || pathsOverlap(writePath, path))
  )
}

/** Development diagnostic when a Surface reads a path the live set omitted from the envelope. */
export const omittedReadMessage = (surface: string, path: ReadonlyArray<string>): string =>
  `[foldkit-ssr] the Surface "${surface}" read "${path.join('.')}", which the live set left out of the envelope; a Message that writes it is not bound on this page, or its footprint is undeclared.`
