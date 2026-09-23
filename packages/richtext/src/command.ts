import {
  NodeId,
  type Block,
  type Document,
  type EditorState,
  type Position,
  type Selection,
} from './document.js'
import { withFreshIds, type Slice } from './clipboard.js'
import { isKnownMark, resolveInsertion, type MarkRegistry } from './marks.js'
import { Edit, apply, type Operation, type TransactionResult } from './transaction.js'

/**
 * Editor intent: what the user is trying to do. Commands resolve against the
 * current document and selection into a Transaction of low-level operations, so
 * durable history keeps its meaning (§19). Identities a command needs come from
 * the caller's `mint`; nothing here reads a clock or a hidden counter.
 */
export type Command =
  | { readonly type: 'InsertText'; readonly text: string }
  | { readonly type: 'DeleteBackward' }
  | { readonly type: 'DeleteForward' }
  | { readonly type: 'SplitBlock' }
  | { readonly type: 'ToggleMark'; readonly mark: string }
  | { readonly type: 'SetSelection'; readonly selection: Selection | null }
  | { readonly type: 'Paste'; readonly slice: Slice }

/** Caller-owned identity source. Live edits mint; replay applies transactions. */
export interface CommandIds {
  readonly mint: () => string
}

/** What a command needs beyond state and identity, such as a Kit's mark policy. */
export interface RunOptions {
  readonly marks?: MarkRegistry | undefined
}

type Failure = 'InvalidSelection' | 'MissingText' | 'InvalidInput'
const failure = (error: Failure): TransactionResult => ({ ok: false, error })

interface Located {
  readonly blockIndex: number
  readonly runIndex: number
  readonly blockId: NodeId
  readonly id: NodeId
  readonly text: string
  readonly marks: ReadonlyArray<string>
}

const locate = (document: Document, node: NodeId): Located | undefined => {
  for (const [blockIndex, block] of document.children.entries()) {
    for (const [runIndex, run] of block.children.entries()) {
      if (run.id === node) {
        return {
          blockIndex,
          runIndex,
          blockId: block.id,
          id: run.id,
          text: run.text,
          marks: run.marks,
        }
      }
    }
  }
  return undefined
}

const isCollapsed = (selection: Extract<Selection, { readonly type: 'Range' }>): boolean =>
  selection.anchor.node === selection.focus.node &&
  selection.anchor.offset === selection.focus.offset

/** A caret is a range whose endpoints coincide; direction is not yet meaningful. */
const caretAt = (position: Position): Selection => ({
  type: 'Range',
  anchor: position,
  focus: position,
})

/** Orders a range's endpoints by document order without losing direction. */
const ordered = (
  document: Document,
  selection: Extract<Selection, { readonly type: 'Range' }>,
): { readonly start: Position; readonly end: Position } | undefined => {
  const anchor = locate(document, selection.anchor.node)
  const focus = locate(document, selection.focus.node)
  if (anchor === undefined || focus === undefined) return undefined
  const after =
    anchor.blockIndex !== focus.blockIndex
      ? anchor.blockIndex > focus.blockIndex
      : anchor.runIndex !== focus.runIndex
        ? anchor.runIndex > focus.runIndex
        : selection.anchor.offset > selection.focus.offset
  return after
    ? { start: selection.focus, end: selection.anchor }
    : { start: selection.anchor, end: selection.focus }
}

interface Span {
  readonly run: Located
  readonly from: number
  readonly to: number
}

/** Runs intersecting an ordered [start, end), with the covered sub-range. */
const covered = (document: Document, start: Position, end: Position): ReadonlyArray<Span> => {
  const startAt = locate(document, start.node)
  const endAt = locate(document, end.node)
  if (startAt === undefined || endAt === undefined) return []
  const spans: Array<Span> = []
  for (const [blockIndex, block] of document.children.entries()) {
    for (const [runIndex, run] of block.children.entries()) {
      const atOrAfterStart =
        blockIndex > startAt.blockIndex ||
        (blockIndex === startAt.blockIndex && runIndex >= startAt.runIndex)
      const atOrBeforeEnd =
        blockIndex < endAt.blockIndex ||
        (blockIndex === endAt.blockIndex && runIndex <= endAt.runIndex)
      if (!atOrAfterStart || !atOrBeforeEnd) continue
      const from =
        blockIndex === startAt.blockIndex && runIndex === startAt.runIndex ? start.offset : 0
      const to =
        blockIndex === endAt.blockIndex && runIndex === endAt.runIndex
          ? end.offset
          : run.text.length
      if (from >= to) continue
      spans.push({
        run: {
          blockIndex,
          runIndex,
          blockId: block.id,
          id: run.id,
          text: run.text,
          marks: run.marks,
        },
        from,
        to,
      })
    }
  }
  return spans
}

/** Deletes an ordered [start, end) across runs, one operation per covered run. */
const deleteRange = (
  document: Document,
  start: Position,
  end: Position,
): ReadonlyArray<Operation> =>
  covered(document, start, end).map(span => Edit.deleteText(span.run.id, span.from, span.to))

/**
 * Resolves one intent into a transaction and applies it atomically. Commands
 * describe intent; the returned `positionMap` and `ChangeSet` describe the
 * document effect, and rejection returns no partially edited state.
 */
export const run = (
  state: EditorState,
  command: Command,
  ids: CommandIds,
  options: RunOptions = {},
): TransactionResult => {
  if (command.type === 'SetSelection') {
    return apply(state, [Edit.setSelection(command.selection)])
  }
  const selection = state.selection
  if (selection === null || selection.type === 'Node') return failure('InvalidSelection')

  if (command.type === 'InsertText') {
    const target = isCollapsed(selection)
      ? resolveInsertion(state.document, selection.anchor, options.marks)
      : ordered(state.document, selection)?.start
    if (target === undefined) return failure('InvalidSelection')
    const at = locate(state.document, target.node)
    if (at === undefined) return failure('MissingText')
    const deletions = isCollapsed(selection)
      ? []
      : deleteRange(state.document, target, ordered(state.document, selection)!.end)
    return apply(state, [
      ...deletions,
      Edit.insertText(target, command.text),
      Edit.setSelection(
        caretAt({ ...target, offset: target.offset + command.text.length, affinity: 'after' }),
      ),
    ])
  }

  if (command.type === 'DeleteBackward' || command.type === 'DeleteForward') {
    if (!isCollapsed(selection)) {
      const span = ordered(state.document, selection)
      if (span === undefined) return failure('InvalidSelection')
      return apply(state, [
        ...deleteRange(state.document, span.start, span.end),
        Edit.setSelection(caretAt(span.start)),
      ])
    }
    const caret = selection.anchor
    const at = locate(state.document, caret.node)
    if (at === undefined) return failure('MissingText')
    const backward = command.type === 'DeleteBackward'
    if (backward ? caret.offset > 0 : caret.offset < at.text.length) {
      const from = backward ? caret.offset - 1 : caret.offset
      return apply(state, [
        Edit.deleteText(at.id, from, from + 1),
        Edit.setSelection(caretAt({ ...caret, offset: backward ? from : caret.offset })),
      ])
    }
    const neighborRun =
      state.document.children[at.blockIndex]?.children[backward ? at.runIndex - 1 : at.runIndex + 1]
    if (neighborRun !== undefined && neighborRun.text.length > 0) {
      const from = backward ? neighborRun.text.length - 1 : 0
      return apply(state, [
        Edit.deleteText(neighborRun.id, from, from + 1),
        Edit.setSelection(
          caretAt(
            backward ? { ...caret, node: neighborRun.id, offset: from, affinity: 'after' } : caret,
          ),
        ),
      ])
    }
    const neighborBlock = state.document.children[backward ? at.blockIndex - 1 : at.blockIndex + 1]
    if (neighborBlock === undefined) return apply(state, [])
    const survivor = backward ? neighborBlock : state.document.children[at.blockIndex]!
    const removed = backward ? state.document.children[at.blockIndex]! : neighborBlock
    const lastRun = survivor.children[survivor.children.length - 1]
    return apply(state, [
      Edit.joinBlocks(survivor.id, removed.id),
      Edit.setSelection(
        caretAt(
          lastRun === undefined
            ? { node: survivor.id, offset: 0, affinity: 'after' }
            : { node: lastRun.id, offset: lastRun.text.length, affinity: 'after' },
        ),
      ),
    ])
  }

  if (command.type === 'SplitBlock') {
    const span = isCollapsed(selection) ? undefined : ordered(state.document, selection)
    if (!isCollapsed(selection) && span === undefined) return failure('InvalidSelection')
    const caret = span?.start ?? selection.anchor
    const at = locate(state.document, caret.node)
    if (at === undefined) return failure('MissingText')
    const textId = ids.mint()
    return apply(state, [
      ...(span === undefined ? [] : deleteRange(state.document, span.start, span.end)),
      Edit.splitBlock(at.blockId, at.id, caret.offset, ids.mint(), textId),
      Edit.setSelection(caretAt({ node: NodeId.make(textId), offset: 0, affinity: 'after' })),
    ])
  }

  if (command.type === 'ToggleMark') {
    if (isCollapsed(selection)) return apply(state, [])
    const span = ordered(state.document, selection)
    if (span === undefined) return failure('InvalidSelection')
    const spans = covered(state.document, span.start, span.end)
    if (spans.length === 0) return apply(state, [])
    const adding = !spans.every(entry => entry.run.marks.includes(command.mark))
    const mark = command.mark
    if (adding && !isKnownMark(mark)) return failure('InvalidInput')
    const operations: Array<Operation> = []
    const targets: Array<NodeId> = []
    for (const [index, entry] of spans.entries()) {
      let target = entry.run.id
      let base = 0
      if (index === 0 && entry.from > 0) {
        const textId = ids.mint()
        operations.push(Edit.splitRun(target, entry.from, textId))
        target = NodeId.make(textId)
        base = entry.from
      }
      if (index === spans.length - 1 && entry.to < entry.run.text.length) {
        operations.push(Edit.splitRun(target, entry.to - base, ids.mint()))
      }
      targets.push(target)
    }
    if (adding) {
      if (!isKnownMark(mark)) return failure('InvalidInput')
      for (const target of targets) operations.push(Edit.addMark(target, mark))
    } else {
      for (const target of targets) operations.push(Edit.removeMark(target, mark))
    }
    return apply(state, operations)
  }

  if (command.type === 'Paste') {
    const content = command.slice.blocks
    if (content.length === 0) return apply(state, [])
    const span = isCollapsed(selection) ? undefined : ordered(state.document, selection)
    if (!isCollapsed(selection) && span === undefined) return failure('InvalidSelection')
    const caret = span?.start ?? selection.anchor
    const at = locate(state.document, caret.node)
    if (at === undefined) return failure('MissingText')
    const operations: Array<Operation> =
      span === undefined ? [] : [...deleteRange(state.document, span.start, span.end)]
    const inserted = withFreshIds(command.slice, ids.mint).blocks
    const block = state.document.children[at.blockIndex]!
    const atBlockStart = at.runIndex === 0 && caret.offset === 0
    const atBlockEnd = at.runIndex === block.children.length - 1 && caret.offset === at.text.length
    let trailingRun: NodeId | undefined
    if (atBlockStart) {
      // Pasting at the very start puts the content above this block.
      for (const [index, piece] of inserted.entries()) {
        operations.push(Edit.insertBlock(piece, at.blockIndex + index))
      }
    } else if (atBlockEnd) {
      for (const [index, piece] of inserted.entries()) {
        operations.push(Edit.insertBlock(piece, at.blockIndex + 1 + index))
      }
    } else {
      // Mid-block: split the block at the caret and land the content between
      // the halves, so the text after the caret stays below what was pasted.
      const textId = ids.mint()
      operations.push(Edit.splitBlock(at.blockId, at.id, caret.offset, ids.mint(), textId))
      trailingRun = NodeId.make(textId)
      for (const [index, piece] of inserted.entries()) {
        operations.push(Edit.insertBlock(piece, at.blockIndex + 1 + index))
      }
    }
    const landing = landingAfter(inserted, trailingRun, state.document, at.blockIndex, atBlockEnd)
    if (landing !== undefined) operations.push(Edit.setSelection(caretAt(landing)))
    return apply(state, operations)
  }

  return apply(state, [])
}

/**
 * Where the caret goes after a paste: the end of the last inserted run, or the
 * start of what follows when the inserted content ends without text — the
 * trailing half a split created, then whatever block follows in the document.
 */
const landingAfter = (
  inserted: ReadonlyArray<Block>,
  trailingRun: NodeId | undefined,
  document: Document,
  blockIndex: number,
  atBlockEnd: boolean,
): Position | undefined => {
  const last = inserted[inserted.length - 1]!
  const lastRun = last.children[last.children.length - 1]
  if (lastRun !== undefined) {
    return { node: lastRun.id, offset: lastRun.text.length, affinity: 'after' }
  }
  if (trailingRun !== undefined) return { node: trailingRun, offset: 0, affinity: 'after' }
  const following = document.children[blockIndex + (atBlockEnd ? 1 : 0)]
  const followingRun = following?.children[0]
  return followingRun === undefined
    ? undefined
    : { node: followingRun.id, offset: 0, affinity: 'after' }
}
