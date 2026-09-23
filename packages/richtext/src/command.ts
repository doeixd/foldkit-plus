import {
  NodeId,
  type Block,
  type Document,
  type EditorState,
  type Mark,
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
  | { readonly type: 'InsertText'; readonly text: string; readonly marks?: ReadonlyArray<string> }
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

/**
 * Deletes an ordered [start, end): one operation per covered run, then the
 * blocks the range spanned are joined, so selecting across a paragraph boundary
 * and deleting removes the boundary too. The first block survives, which is
 * where the caret already is.
 */
const deleteRange = (
  document: Document,
  start: Position,
  end: Position,
): ReadonlyArray<Operation> => {
  const startAt = locate(document, start.node)
  const endAt = locate(document, end.node)
  const deletions: Array<Operation> = covered(document, start, end).map(span =>
    Edit.deleteText(span.run.id, span.from, span.to),
  )
  if (startAt === undefined || endAt === undefined || endAt.blockIndex <= startAt.blockIndex) {
    return deletions
  }
  const survivor = document.children[startAt.blockIndex]!.id
  for (let index = startAt.blockIndex + 1; index <= endAt.blockIndex; index++) {
    const block = document.children[index]
    if (block !== undefined) deletions.push(Edit.joinBlocks(survivor, block.id))
  }
  return deletions
}

const isHighSurrogate = (code: number): boolean => code >= 0xd800 && code <= 0xdbff
const isLowSurrogate = (code: number): boolean => code >= 0xdc00 && code <= 0xdfff

/** A combining mark, by the ranges this version knows: the ones that extend a grapheme. */
const isCombining = (code: number): boolean =>
  (code >= 0x0300 && code <= 0x036f) ||
  (code >= 0x0483 && code <= 0x0489) ||
  (code >= 0x1ab0 && code <= 0x1aff) ||
  (code >= 0x20d0 && code <= 0x20ff) ||
  (code >= 0xfe20 && code <= 0xfe2f)

/**
 * Where the grapheme before `offset` starts: a surrogate pair counts as one
 * character, and the combining marks that extend it go with it. Deleting half a
 * character is corruption, not an edit, and UTF-16 coordinates do not require
 * it: a command can remove the whole grapheme.
 */
const previousBoundary = (text: string, offset: number): number => {
  if (offset <= 0) return 0
  let index = offset - 1
  if (
    isLowSurrogate(text.charCodeAt(index)) &&
    index > 0 &&
    isHighSurrogate(text.charCodeAt(index - 1))
  ) {
    index -= 1
  }
  while (index > 0 && isCombining(text.charCodeAt(index))) index -= 1
  return index
}

/** Where the grapheme at `offset` ends, for forward deletion. */
const nextBoundary = (text: string, offset: number): number => {
  if (offset >= text.length) return text.length
  let index = offset + 1
  if (
    isHighSurrogate(text.charCodeAt(offset)) &&
    index < text.length &&
    isLowSurrogate(text.charCodeAt(index))
  ) {
    index += 1
  }
  while (index < text.length && isCombining(text.charCodeAt(index))) index += 1
  return index
}

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
    // Stored marks are explicit: when the command carries them, the inserted
    // text must end up with exactly that set, whatever run it lands in. Without
    // them, the boundary rule decides (typing after bold continues bold).
    const stored = command.marks
    const target = isCollapsed(selection)
      ? stored === undefined
        ? resolveInsertion(state.document, selection.anchor, options.marks)
        : selection.anchor
      : ordered(state.document, selection)?.start
    if (target === undefined) return failure('InvalidSelection')
    const at = locate(state.document, target.node)
    if (at === undefined) return failure('MissingText')
    const marks: Array<Mark> = []
    if (stored !== undefined) {
      for (const mark of stored) {
        if (!isKnownMark(mark)) return failure('InvalidInput')
        marks.push(mark)
      }
    }
    const deletions = isCollapsed(selection)
      ? []
      : deleteRange(state.document, target, ordered(state.document, selection)!.end)
    if (stored === undefined) {
      return apply(state, [
        ...deletions,
        Edit.insertText(target, command.text),
        Edit.setSelection(
          caretAt({ ...target, offset: target.offset + command.text.length, affinity: 'after' }),
        ),
      ])
    }
    // Split the inserted span out of its run — at the end first, so the start
    // offset stays valid — then give the span exactly these marks.
    const span = isCollapsed(selection) ? undefined : ordered(state.document, selection)
    // Where the text that survives the range deletion begins in the original
    // run. A range that runs past this run takes its whole tail with it.
    const tailFrom =
      span === undefined
        ? target.offset
        : span.end.node === target.node
          ? span.end.offset
          : at.text.length
    const operations: Array<Operation> = [...deletions, Edit.insertText(target, command.text)]
    const end = target.offset + command.text.length
    if (tailFrom < at.text.length) operations.push(Edit.splitRun(target.node, end, ids.mint()))
    const piece = target.offset > 0 ? NodeId.make(ids.mint()) : target.node
    if (target.offset > 0) operations.push(Edit.splitRun(target.node, target.offset, piece))
    for (const mark of marks) {
      if (!at.marks.includes(mark)) operations.push(Edit.addMark(piece, mark))
    }
    for (const mark of at.marks) {
      if (!marks.some(kept => kept === mark)) operations.push(Edit.removeMark(piece, mark))
    }
    return apply(state, operations)
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
      const from = backward ? previousBoundary(at.text, caret.offset) : caret.offset
      const to = backward ? caret.offset : nextBoundary(at.text, caret.offset)
      return apply(state, [
        Edit.deleteText(at.id, from, to),
        Edit.setSelection(caretAt({ ...caret, offset: backward ? from : caret.offset })),
      ])
    }
    const neighborRun =
      state.document.children[at.blockIndex]?.children[backward ? at.runIndex - 1 : at.runIndex + 1]
    if (neighborRun !== undefined && neighborRun.text.length > 0) {
      // Stepping into the neighbor removes that run's whole grapheme, not one
      // code unit of it.
      const from = backward ? previousBoundary(neighborRun.text, neighborRun.text.length) : 0
      const to = backward ? neighborRun.text.length : nextBoundary(neighborRun.text, 0)
      return apply(state, [
        Edit.deleteText(neighborRun.id, from, to),
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
