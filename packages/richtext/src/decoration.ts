/**
 * Decorations (§64): the ephemeral third kind beside Marks and Annotations. A
 * decoration is presentation derived from current state — a search match, a lint
 * warning, a remote cursor, a syntax token — rendered by an interpreter and then
 * discarded. It is never serialized, never part of undo, and never authored content,
 * which is why this module holds contracts rather than document data.
 *
 * The projection here is shared on purpose: a read-only renderer, the editable adapter,
 * and any other interpreter all need the same answer to "which decorations cover this
 * run, and where", so they compute it once, in the core, rather than each cutting ranges
 * their own way.
 */
import { eachBlock, type Document, type NodeId, type Position } from './document.js'

/**
 * One decoration over a document range. `kind` is a fixed word the presentation is
 * chosen by (`search`, `syntax`, `cursor`, …); `data` is the renderer's own payload,
 * which the core never reads.
 */
export interface Decoration<Data = unknown> {
  readonly from: Position
  readonly to: Position
  readonly kind: string
  readonly data?: Data
}

/** A set of decorations is a value, computed for one render and then discarded. */
export type DecorationSet<Data = unknown> = ReadonlyArray<Decoration<Data>>

/** A decoration's sub-range inside one run, in that run's own offsets. */
export interface DecorationSpan<Data = unknown> {
  readonly from: number
  readonly to: number
  readonly decoration: Decoration<Data>
}

/**
 * The decorations covering each run, as offsets into it, in document order. A decoration
 * that crosses runs is cut at each run's edge, so a renderer never has to reason about
 * document order; a decoration whose endpoints do not resolve is skipped rather than
 * guessed at, the way every other read treats a position it cannot resolve, and a
 * direction is honoured rather than required to run forwards.
 *
 * The runs are indexed once, so a decoration costs the runs it covers: a hundred search
 * matches over a long document is one walk, not a hundred.
 */
export const decorationsIn = <Data>(
  document: Document,
  set: DecorationSet<Data>,
): ReadonlyMap<NodeId, ReadonlyArray<DecorationSpan<Data>>> => {
  const spans = new Map<NodeId, Array<DecorationSpan<Data>>>()
  if (set.length === 0) return spans
  // Document order is depth-first, which is what `compareRunPlaces` orders by too.
  const runs: Array<{ readonly id: NodeId; readonly length: number }> = []
  const indexByRun = new Map<NodeId, number>()
  eachBlock(document.children, block => {
    for (const run of block.children) {
      indexByRun.set(run.id, runs.length)
      runs.push({ id: run.id, length: run.text.length })
    }
  })
  for (const decoration of set) {
    const anchor = indexByRun.get(decoration.from.node)
    const focus = indexByRun.get(decoration.to.node)
    if (anchor === undefined || focus === undefined) continue
    const forward = anchor <= focus
    const first = forward ? anchor : focus
    const last = forward ? focus : anchor
    const firstOffset = forward ? decoration.from.offset : decoration.to.offset
    const lastOffset = forward ? decoration.to.offset : decoration.from.offset
    for (let index = first; index <= last; index += 1) {
      const run = runs[index]!
      const from = Math.max(0, index === first ? firstOffset : 0)
      const to = Math.min(run.length, index === last ? lastOffset : run.length)
      if (from >= to) continue
      const covered = spans.get(run.id)
      const span = { from, to, decoration }
      if (covered === undefined) spans.set(run.id, [span])
      else covered.push(span)
    }
  }
  // A renderer walks a run's text forwards, so its spans are in that order.
  for (const covered of spans.values()) covered.sort((left, right) => left.from - right.from)
  return spans
}

/** A stretch of one run's text, and the decorations covering all of it. */
export interface RunPiece<Data = unknown> {
  readonly text: string
  readonly decorations: ReadonlyArray<Decoration<Data>>
}

/**
 * A run's text cut at every edge of the spans over it, each piece with the decorations
 * that cover it — what every interpreter draws, so each draws the same pieces. An empty run,
 * or one no span touches, is one undecorated piece: an interpreter still has to render
 * somewhere for a caret to sit, and nothing can be drawn over no text.
 */
export const runPieces = <Data>(
  text: string,
  spans: ReadonlyArray<DecorationSpan<Data>>,
): ReadonlyArray<RunPiece<Data>> => {
  if (spans.length === 0 || text.length === 0) return [{ text, decorations: [] }]
  const edges = new Set<number>([0, text.length])
  for (const span of spans) {
    edges.add(Math.max(0, Math.min(text.length, span.from)))
    edges.add(Math.max(0, Math.min(text.length, span.to)))
  }
  const cuts = [...edges].sort((left, right) => left - right)
  const pieces: Array<RunPiece<Data>> = []
  for (let index = 0; index < cuts.length - 1; index += 1) {
    const from = cuts[index]!
    const to = cuts[index + 1]!
    pieces.push({
      text: text.slice(from, to),
      decorations: spans
        .filter(span => span.from <= from && to <= span.to)
        .map(span => span.decoration),
    })
  }
  return pieces
}
