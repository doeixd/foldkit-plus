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
import {
  compareRunPlaces,
  eachBlock,
  locateRun,
  type Document,
  type NodeId,
  type Position,
} from './document.js'

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
 */
export const decorationsIn = <Data>(
  document: Document,
  set: DecorationSet<Data>,
): ReadonlyMap<NodeId, ReadonlyArray<DecorationSpan<Data>>> => {
  const spans = new Map<NodeId, Array<DecorationSpan<Data>>>()
  for (const decoration of set) {
    const anchor = locateRun(document, decoration.from.node)
    const focus = locateRun(document, decoration.to.node)
    if (anchor === undefined || focus === undefined) continue
    const forward =
      compareRunPlaces(
        { path: anchor.path, index: anchor.index },
        { path: focus.path, index: focus.index },
      ) <= 0
    const start = forward ? anchor : focus
    const startOffset = forward ? decoration.from.offset : decoration.to.offset
    const end = forward ? focus : anchor
    const endOffset = forward ? decoration.to.offset : decoration.from.offset
    const startPlace = { path: start.path, index: start.index }
    const endPlace = { path: end.path, index: end.index }
    eachBlock(document.children, (block, path) => {
      for (const [index, run] of block.children.entries()) {
        const place = { path, index }
        const before = compareRunPlaces(place, startPlace)
        const after = compareRunPlaces(place, endPlace)
        if (before < 0 || after > 0) continue
        const from = Math.max(0, before === 0 ? startOffset : 0)
        const to = Math.min(run.text.length, after === 0 ? endOffset : run.text.length)
        if (from >= to) continue
        const covered = spans.get(run.id)
        const span = { from, to, decoration }
        if (covered === undefined) spans.set(run.id, [span])
        else covered.push(span)
      }
    })
  }
  // A renderer walks a run's text forwards, so its spans are in that order.
  for (const covered of spans.values()) covered.sort((left, right) => left.from - right.from)
  return spans
}
