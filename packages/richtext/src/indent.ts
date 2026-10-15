/**
 * Indentation in a kind whose lines are indented, as code's are (`node(…, { indents })`):
 * Tab indents, Shift+Tab outdents, and Enter starts the new line as indented as the one it
 * broke. A line is the text between two breaks of one block.
 */
import { positionInBlock, type Block, type EditorState, type Position } from './document.js'
import { Edit, apply, type Operation, type TransactionResult } from './transaction.js'

/** What one level of indentation is: two spaces. */
export const INDENT = '  '

const textOf = (block: Block): string => block.children.map(run => run.text).join('')

/** A position's offset into its block's whole text, or undefined when it is not the block's. */
export const offsetIn = (block: Block, position: Position): number | undefined => {
  let consumed = 0
  for (const run of block.children) {
    if (run.id === position.node) return consumed + position.offset
    consumed += run.text.length
  }
  return undefined
}

const lineStart = (text: string, offset: number): number => text.lastIndexOf('\n', offset - 1) + 1

/** The leading spaces and tabs of the line `offset` is on, up to `offset`. */
export const indentationAt = (text: string, offset: number): string =>
  /^[ \t]*/.exec(text.slice(lineStart(text, offset), offset))?.[0] ?? ''

/**
 * The starts of the lines a range covers, last first, so editing each leaves the offsets of the
 * ones before it as they were. A line the range only reaches the start of is not covered.
 */
const linesCovered = (text: string, from: number, to: number): ReadonlyArray<number> => {
  const starts = [lineStart(text, from)]
  for (let at = text.indexOf('\n', from); at !== -1 && at + 1 < to; at = text.indexOf('\n', at + 1))
    starts.push(at + 1)
  return starts.reverse()
}

/** The selection's ends as offsets into the block's text, in order, or undefined. */
const span = (
  state: EditorState,
  block: Block,
): { readonly from: number; readonly to: number } | undefined => {
  const selection = state.selection
  if (selection?.type !== 'Range') return undefined
  const anchor = offsetIn(block, selection.anchor)
  const focus = offsetIn(block, selection.focus)
  if (anchor === undefined || focus === undefined) return undefined
  return { from: Math.min(anchor, focus), to: Math.max(anchor, focus) }
}

/**
 * Tab: at a caret, a level of indentation where the caret is; over a range, a level at the start
 * of every line it covers, so a block of code moves right together.
 */
export const indent = (state: EditorState, block: Block): TransactionResult => {
  const ends = span(state, block)
  if (ends === undefined) return { ok: false, error: 'InvalidSelection' }
  const text = textOf(block)
  const at = (offset: number) => positionInBlock(block, offset)
  if (ends.from === ends.to) {
    const caret = at(ends.from)
    if (caret === undefined) return { ok: false, error: 'InvalidSelection' }
    // The caret goes after the indentation whichever side of the offset it leaned: a caret the
    // browser reports at a line's start leans `before`, and would stay in front of it.
    const after = {
      node: caret.node,
      offset: caret.offset + INDENT.length,
      affinity: 'after' as const,
    }
    return apply(state, [
      Edit.insertText(caret, INDENT),
      Edit.setSelection({ type: 'Range', anchor: after, focus: after }),
    ])
  }
  const operations: Array<Operation> = []
  for (const start of linesCovered(text, ends.from, ends.to)) {
    const position = at(start)
    if (position !== undefined) operations.push(Edit.insertText(position, INDENT))
  }
  return apply(state, operations)
}

/** Shift+Tab: up to a level of indentation off the start of every line the selection is on. */
export const outdent = (state: EditorState, block: Block): TransactionResult => {
  const ends = span(state, block)
  if (ends === undefined) return { ok: false, error: 'InvalidSelection' }
  const text = textOf(block)
  const starts =
    ends.from === ends.to ? [lineStart(text, ends.from)] : linesCovered(text, ends.from, ends.to)
  const operations: Array<Operation> = []
  for (const start of starts) {
    const leading = /^(?: {1,2}|\t)/.exec(text.slice(start))?.[0].length ?? 0
    const from = positionInBlock(block, start)
    // An indentation split across runs is left alone: code runs carry no marks, so it is one.
    if (leading === 0 || from === undefined || from.offset + leading > runLength(block, from))
      continue
    operations.push(Edit.deleteText(from.node, from.offset, from.offset + leading))
  }
  return apply(state, operations)
}

const runLength = (block: Block, position: Position): number =>
  block.children.find(run => run.id === position.node)?.text.length ?? 0
