import { Schema } from 'effect'
import {
  Block,
  NodeId,
  type Document,
  type Position,
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
    for (const block of slice.blocks) {
      for (const node of [block, ...block.children]) {
        if (ids.has(node.id)) return 'Duplicate slice identity'
        ids.add(node.id)
      }
    }
    return true
  }),
)
export type Slice = typeof Slice.Type

export const emptySlice: Slice = Object.freeze({ version: 1, blocks: [] })

const decodeSlice = Schema.decodeUnknownSync(Slice, { onExcessProperty: 'error' })
const encodeSlice = Schema.encodeSync(Slice)

interface Located {
  readonly block: Block
  readonly index: number
}

const locate = (document: Document, node: NodeId): Located | undefined => {
  for (const [index, block] of document.children.entries()) {
    if (block.id === node) return { block, index }
    if (block.children.some(run => run.id === node)) return { block, index }
  }
  return undefined
}

/** Orders a range's endpoints without losing the selection's direction. */
const ordered = (
  document: Document,
  selection: Extract<Selection, { readonly type: 'Range' }>,
): { readonly start: Position; readonly end: Position } | undefined => {
  const anchor = locate(document, selection.anchor.node)
  const focus = locate(document, selection.focus.node)
  if (anchor === undefined || focus === undefined) return undefined
  const after =
    anchor.index !== focus.index
      ? anchor.index > focus.index
      : selection.anchor.offset > selection.focus.offset
  return after
    ? { start: selection.focus, end: selection.anchor }
    : { start: selection.anchor, end: selection.focus }
}

const trim = (run: Text, from: number, to: number): Text => ({
  ...run,
  text: run.text.slice(from, to),
})

/**
 * The semantic content a copy would take: whole blocks for a node selection,
 * and for a range only the covered part of each touched block, with runs
 * trimmed to the selection. Blocks the range never enters are left out, so a
 * partial copy never drags a paragraph along.
 */
export const sliceOf = (document: Document, selection: Selection | null): Slice | undefined => {
  if (selection === null) return undefined
  if (selection.type === 'Node') {
    const located = locate(document, selection.node)
    return located === undefined ? undefined : { version: 1, blocks: [located.block] }
  }
  const span = ordered(document, selection)
  if (span === undefined) return undefined
  const startAt = locate(document, span.start.node)
  const endAt = locate(document, span.end.node)
  if (startAt === undefined || endAt === undefined) return undefined
  const blocks: Array<Block> = []
  for (const [index, block] of document.children.entries()) {
    if (index < startAt.index || index > endAt.index) continue
    if (block.type === 'Unknown') {
      blocks.push(block)
      continue
    }
    const firstRun =
      index === startAt.index ? block.children.findIndex(run => run.id === span.start.node) : -1
    const lastRun =
      index === endAt.index ? block.children.findIndex(run => run.id === span.end.node) : -1
    const children: Array<Text> = []
    for (const [runIndex, run] of block.children.entries()) {
      if (firstRun >= 0 && runIndex < firstRun) continue
      if (lastRun >= 0 && runIndex > lastRun) continue
      const from = runIndex === firstRun ? span.start.offset : 0
      const to = runIndex === lastRun ? span.end.offset : run.text.length
      if (from >= to) continue
      children.push(trim(run, from, to))
    }
    if (children.length > 0) blocks.push({ ...block, children })
  }
  return { version: 1, blocks }
}

/** Plain text of a slice, one line per block; unknown blocks keep a placeholder. */
export const plainTextOf = (slice: Slice): string =>
  slice.blocks
    .map(block =>
      block.type === 'Unknown'
        ? `[${block.originalType}]`
        : block.children.map(run => run.text).join(''),
    )
    .join('\n')

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
export const withFreshIds = (slice: Slice, mint: () => string): Slice => ({
  version: 1,
  blocks: slice.blocks.map(block => ({
    ...block,
    id: NodeId.make(mint()),
    children: block.children.map(run => ({ ...run, id: NodeId.make(mint()) })),
  })),
})

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
