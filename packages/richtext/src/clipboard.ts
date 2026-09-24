import { Schema } from 'effect'
import { toText } from './html.js'
import {
  Block,
  NodeId,
  blockAtPath,
  compareRunPlaces,
  eachBlock,
  locateBlock,
  locateRun,
  pathKey,
  type BlockPath,
  type Document,
  type RunPlace,
  type Selection,
  type Text,
} from './document.js'

/**
 * Clipboard content is semantic, not HTML (§69). A slice is a versioned,
 * identity-carrying fragment of a document: it round-trips through an
 * application's own format, and a paste mints fresh identities so nothing
 * collides with the document it lands in. HTML and plain text are interchange
 * fallbacks the adapter adds; they are not the slice.
 */
export const Slice = Schema.Struct({
  version: Schema.Literal(1),
  blocks: Schema.Array(Block),
}).check(
  Schema.makeFilter(slice => {
    const ids = new Set<NodeId>()
    let duplicate = false
    eachBlock(slice.blocks, block => {
      for (const id of [block.id, ...block.children.map(run => run.id)]) {
        if (ids.has(id)) duplicate = true
        ids.add(id)
      }
    })
    return !duplicate || 'Duplicate slice identity'
  }),
)
export type Slice = typeof Slice.Type

export const emptySlice: Slice = Object.freeze({ version: 1, blocks: [] })

const decodeSlice = Schema.decodeUnknownSync(Slice, { onExcessProperty: 'error' })
const encodeSlice = Schema.encodeSync(Slice)

const trim = (run: Text, from: number, to: number): Text => ({
  ...run,
  text: run.text.slice(from, to),
})

/** A covered span: the two endpoints, ordered, each with its offset in its run. */
interface CoveredSpan {
  readonly start: RunPlace & { readonly offset: number }
  readonly end: RunPlace & { readonly offset: number }
}

/** Whether a block's subtree contains an endpoint, or sits between the two. */
const inRange = (blockPath: BlockPath, span: CoveredSpan): boolean => {
  const contains = (place: RunPlace): boolean =>
    blockPath.length <= place.path.length &&
    blockPath.every((index, depth) => place.path[depth] === index)
  if (contains(span.start) || contains(span.end)) return true
  const first = { path: blockPath, index: 0 }
  return compareRunPlaces(first, span.start) > 0 && compareRunPlaces(first, span.end) < 0
}

/** The runs of one block that the span covers, trimmed to it. */
const coveredRuns = (
  block: Block,
  blockPath: BlockPath,
  span: CoveredSpan,
): ReadonlyArray<Text> => {
  const atStart = pathKey(blockPath) === pathKey(span.start.path)
  const atEnd = pathKey(blockPath) === pathKey(span.end.path)
  if (!atStart && !atEnd) return block.children
  const from = atStart ? span.start.index : 0
  const to = atEnd ? span.end.index : block.children.length - 1
  const children: Array<Text> = []
  for (const [index, run] of block.children.entries()) {
    if (index < from || index > to) continue
    const trimFrom = index === from && atStart ? span.start.offset : 0
    const trimTo = index === to && atEnd ? span.end.offset : run.text.length
    if (trimFrom >= trimTo) continue
    children.push(trim(run, trimFrom, trimTo))
  }
  return children
}

/**
 * The covered part of a block list: the blocks the span reaches, each trimmed to
 * it. A container is kept with the children the span reaches, so copying across
 * two list items carries the list rather than two loose paragraphs.
 */
const coveredBlocks = (
  blocks: ReadonlyArray<Block>,
  prefix: BlockPath,
  span: CoveredSpan,
): ReadonlyArray<Block> => {
  const covered: Array<Block> = []
  for (const [index, block] of blocks.entries()) {
    const path = [...prefix, index]
    if (!inRange(path, span)) continue
    if (block.type === 'Unknown') {
      covered.push(block)
      continue
    }
    const children = coveredRuns(block, path, span)
    if (block.type === 'Node' && block.blocks !== undefined) {
      const nested = coveredBlocks(block.blocks, path, span)
      if (children.length === 0 && nested.length === 0) continue
      covered.push({ ...block, children, blocks: nested })
      continue
    }
    if (children.length === 0) continue
    covered.push({ ...block, children })
  }
  return covered
}

/**
 * The semantic content a copy would take: a whole block for a node selection,
 * and for a range only the covered part of what it reaches, with runs trimmed to
 * the selection. Blocks the range never enters are left out, so a partial copy
 * never drags a paragraph along.
 */
export const sliceOf = (document: Document, selection: Selection | null): Slice | undefined => {
  if (selection === null) return undefined
  if (selection.type === 'Node') {
    const located = locateBlock(document, selection.node)
    return located === undefined ? undefined : { version: 1, blocks: [located.block] }
  }
  const anchor = locateRun(document, selection.anchor.node)
  const focus = locateRun(document, selection.focus.node)
  if (anchor === undefined || focus === undefined) return undefined
  const anchorPlace = { ...anchor, offset: selection.anchor.offset }
  const focusPlace = { ...focus, offset: selection.focus.offset }
  const span: CoveredSpan =
    compareRunPlaces(anchor, focus) <= 0
      ? { start: anchorPlace, end: focusPlace }
      : { start: focusPlace, end: anchorPlace }
  // A span inside one block copies that block, as it does at the top level; a
  // span across blocks keeps the containers that hold them, so copying across
  // two list items carries the list.
  if (pathKey(span.start.path) === pathKey(span.end.path)) {
    const block = blockAtPath(document, span.start.path)
    if (block === undefined || block.type === 'Unknown') return { version: 1, blocks: [] }
    const children = coveredRuns(block, span.start.path, span)
    return { version: 1, blocks: children.length === 0 ? [] : [{ ...block, children }] }
  }
  return { version: 1, blocks: coveredBlocks(document.children, [], span) }
}

/**
 * Plain text of a slice, one line per text block. A slice and a block list have
 * the same shape, so the serializer's walk serves both.
 */
export const plainTextOf = (slice: Slice): string => toText(slice.blocks)

/**
 * A slice from pasted plain text: one paragraph per line. Identities come from
 * the caller, like every other identity a live edit mints.
 */
export const sliceFromText = (text: string, mint: () => string): Slice => ({
  version: 1,
  blocks: text.split(/\r\n|\r|\n/).map(line => ({
    type: 'Paragraph' as const,
    id: NodeId.make(mint()),
    children: [
      {
        type: 'Text' as const,
        id: NodeId.make(mint()),
        text: line,
        marks: [],
      },
    ],
  })),
})

/** The same content under fresh identities, so a paste can never collide. */
export const withFreshIds = (slice: Slice, mint: () => string): Slice => {
  // Pre-order: a block's identity, then its runs, then its nested blocks.
  const freshBlock = (block: Block): Block => {
    const id = NodeId.make(mint())
    const children = block.children.map(run => ({ ...run, id: NodeId.make(mint()) }))
    if (block.type === 'Node' && block.blocks !== undefined) {
      return { ...block, id, children, blocks: block.blocks.map(freshBlock) }
    }
    return { ...block, id, children }
  }
  return { version: 1, blocks: slice.blocks.map(freshBlock) }
}

/** Encodes a slice for the clipboard. */
export const serializeSlice = (slice: Slice): string => JSON.stringify(encodeSlice(slice))

/** Decodes a slice, or undefined when the payload is not one this version wrote. */
export const deserializeSlice = (input: unknown): Slice | undefined => {
  try {
    return decodeSlice(typeof input === 'string' ? JSON.parse(input) : input)
  } catch {
    return undefined
  }
}
