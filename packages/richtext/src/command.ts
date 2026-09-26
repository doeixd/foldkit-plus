import { Equal, Schema } from 'effect'
import {
  NodeId,
  blockAtPath,
  compareRunPlaces,
  eachBlock,
  locateBlock,
  locateRun,
  pathKey,
  textContent,
  type Block,
  type BlockPath,
  type Document,
  type EditorState,
  type MarkValue,
  type Position,
  type RunMark,
  type Selection,
  type Text as Run,
} from './document.js'
import { withFreshIds, type Slice } from './clipboard.js'
import {
  markName,
  resolveInsertion,
  propsFailure,
  sameMark,
  shippedRegistry,
  type MarkRegistry,
} from './marks.js'
import { blockKind, type NodeRegistry } from './kit.js'
import {
  Edit,
  apply,
  type ChangeSet,
  type Operation,
  type TextBlock,
  type TransactionResult,
} from './transaction.js'

/**
 * Editor intent: what the user is trying to do. Commands resolve against the
 * current document and selection into a Transaction of low-level operations, so
 * durable history keeps its meaning (§19). Identities a command needs come from
 * the caller's `mint`; nothing here reads a clock or a hidden counter.
 */
export type Command =
  | {
      readonly type: 'InsertText'
      readonly text: string
      /** Stored marks: a bare name, or a value when the mark carries props. */
      readonly marks?: ReadonlyArray<string | MarkValue>
    }
  | { readonly type: 'DeleteBackward' }
  | { readonly type: 'DeleteForward' }
  | { readonly type: 'SplitBlock' }
  | { readonly type: 'ToggleMark'; readonly mark: string | MarkValue }
  /**
   * Puts exactly this mark on every run the selection covers, replacing a same-named mark
   * whose props differ: how a link gets a new `href`. A caret acts on the extent of the
   * mark around it (`markExtent`), and does nothing outside one.
   */
  | { readonly type: 'SetMark'; readonly mark: string | MarkValue }
  /** Takes the named mark off every run the selection covers; a caret, off its extent. */
  | { readonly type: 'ClearMark'; readonly mark: string }
  | { readonly type: 'SetSelection'; readonly selection: Selection | null }
  | { readonly type: 'Paste'; readonly slice: Slice }
  /** Retypes the block the selection starts in: a paragraph, or a heading. */
  | { readonly type: 'RetypeBlock'; readonly to: TextBlock }
  /**
   * Wraps the block the selection starts in, in new containers listed outermost first: a
   * `Quote`, or a `List` holding a `ListItem`. The block keeps its identity and its runs,
   * so the caret stays where it was. Given a vocabulary, a list wrap right after a list of the
   * same kind and props adds the block to it as a new item.
   */
  | { readonly type: 'WrapBlock'; readonly containers: ReadonlyArray<Container> }
  /**
   * Replaces the text block the selection starts in with a node kind that holds text, such
   * as a `CodeBlock`, carrying its text and marks. Identities are never reused, so the block
   * and its runs get new ones and the selection moves onto them at the same offsets.
   */
  | { readonly type: 'ConvertBlock'; readonly to: Container }
  /**
   * Lifts the block the selection starts in out of its container, the inverse of a wrap:
   * repeated while the new parent's declaration refuses it, so a list item's paragraph leaves
   * both the item and the list. The block keeps its identity, and the caret with it.
   */
  | { readonly type: 'LiftBlock' }

/** A container a block is wrapped in: a node kind, and the props it starts with. */
export const Container = Schema.Struct({
  kind: Schema.NonEmptyString,
  props: Schema.optionalKey(Schema.JsonObject),
})
export type Container = typeof Container.Type

/** Caller-owned identity source. Live edits mint; replay applies transactions. */
export interface CommandIds {
  readonly mint: () => string
}

/** What a command needs beyond state and identity, such as a Kit's mark policy. */
export interface RunOptions {
  readonly marks?: MarkRegistry | undefined
  /** The node vocabulary, so an edit a constraint forbids is refused here (§125). */
  readonly nodes?: NodeRegistry | undefined
}

/**
 * Whether the block at a path is declared to carry no marks, in which case adding one
 * is refused at the command layer rather than reported only by `validate` (§125). A
 * preserved block is left alone: it has no declaration to read, and preserving it
 * matters more than forbidding a mark on it.
 */
const forbidsMarks = (
  document: Document,
  path: BlockPath,
  nodes: NodeRegistry | undefined,
): boolean => {
  if (nodes === undefined) return false
  const block = blockAtPath(document, path)
  if (block === undefined || block.type === 'Unknown') return false
  return kindForbidsMarks(nodes, blockKind(block))
}

const kindForbidsMarks = (nodes: NodeRegistry, kind: string): boolean => {
  const declared = nodes.definitionFor(kind)
  return declared?.kind === 'node' && declared.marks === 'none'
}

/**
 * Whether the block at a path accepts a child of this kind. A declaration without a
 * constraint accepts any block, and a vocabulary that does not declare the parent is
 * not consulted — `validate` reports an undeclared kind, and an edit should not fail
 * for a reason the caller never stated.
 */
const acceptsChild = (
  document: Document,
  path: BlockPath,
  kind: string,
  nodes: NodeRegistry | undefined,
): boolean => {
  const parent = blockAtPath(document, path)
  return parent === undefined || kindAccepts(nodes, blockKind(parent), kind)
}

/** Whether a kind's declaration lets it hold another as a nested block; undeclared is open. */
const kindAccepts = (
  nodes: NodeRegistry | undefined,
  parentKind: string,
  childKind: string,
): boolean => {
  if (nodes === undefined) return true
  const declared = nodes.definitionFor(parentKind)
  if (declared?.kind !== 'node' || typeof declared.children === 'string') return true
  return declared.children.of.includes(childKind)
}

/** Whether the vocabulary declares props for a new node that these do not decode as. */
const refusesProps = (nodes: NodeRegistry | undefined, container: Container): boolean => {
  const declared = nodes?.definitionFor(container.kind)
  return (
    declared !== undefined &&
    declared.kind !== 'block' &&
    propsFailure(declared.props, container.props ?? {})
  )
}

/** Whether the vocabulary names `itemKind` among the kinds `listKind` holds, as `List` names `ListItem`. */
const holdsItem = (nodes: NodeRegistry, listKind: string, itemKind: string): boolean => {
  const declared = nodes.definitionFor(listKind)
  return (
    declared?.kind === 'node' &&
    typeof declared.children !== 'string' &&
    declared.children.of.includes(itemKind)
  )
}

/**
 * Whether a kind can be a new container. Unlike an existing parent, a kind a wrap creates
 * must be declared as holding nested blocks when there is a vocabulary: wrapping in an
 * undeclared kind, or a text kind such as `CodeBlock`, would make content `validate`
 * refuses.
 */
const holdsBlocks = (nodes: NodeRegistry | undefined, kind: string): boolean => {
  if (nodes === undefined) return true
  const declared = nodes.definitionFor(kind)
  return declared?.kind === 'node' && declared.children !== textContent
}

type Failure =
  | 'InvalidSelection'
  | 'MissingText'
  | 'InvalidInput'
  | 'InvalidParent'
  | 'ForbiddenMark'
  | 'UnexpectedChild'
const failure = (error: Failure): TransactionResult => ({ ok: false, error })

interface Located {
  readonly path: BlockPath
  readonly runIndex: number
  readonly blockId: NodeId
  readonly id: NodeId
  readonly text: string
  readonly marks: ReadonlyArray<RunMark>
}

/** Document order over a located run, by the shared place rule. */
const locatedOrder = (
  left: { readonly path: BlockPath; readonly runIndex: number },
  right: { readonly path: BlockPath; readonly runIndex: number },
): number =>
  compareRunPlaces(
    { path: left.path, index: left.runIndex },
    { path: right.path, index: right.runIndex },
  )

const locate = (document: Document, node: NodeId): Located | undefined => {
  const found = locateRun(document, node)
  if (found === undefined) return undefined
  const block = blockAtPath(document, found.path)
  if (block === undefined) return undefined
  return {
    path: found.path,
    runIndex: found.index,
    blockId: block.id,
    id: found.run.id,
    text: found.run.text,
    marks: found.run.marks,
  }
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
  const byPlace = locatedOrder(anchor, focus)
  const after = byPlace !== 0 ? byPlace > 0 : selection.anchor.offset > selection.focus.offset
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
  // The walk is document order, so comparing each run's place against the
  // endpoints' places picks out the covered span however deep it sits.
  eachBlock(document.children, (block, path) => {
    for (const [runIndex, run] of block.children.entries()) {
      const place = { path, runIndex }
      if (locatedOrder(place, startAt) < 0 || locatedOrder(place, endAt) > 0) continue
      const from = locatedOrder(place, startAt) === 0 ? start.offset : 0
      const to = locatedOrder(place, endAt) === 0 ? end.offset : run.text.length
      if (from >= to) continue
      spans.push({
        run: {
          path,
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
  })
  return spans
}

/** Marks every run in the list carries; empty when there are no runs. */
const sharedMarks = (runs: ReadonlyArray<ReadonlyArray<RunMark>>): ReadonlySet<string> => {
  let common: Set<string> | undefined
  for (const marks of runs) {
    const names = new Set(marks.map(markName))
    if (common === undefined) {
      common = names
      continue
    }
    for (const name of common) if (!names.has(name)) common.delete(name)
  }
  return common ?? new Set()
}

/**
 * The marks every run the selection covers carries: the ones a toggle would
 * remove, which is what an "active" toolbar button means. A caret reports its
 * run's marks — an empty run can carry them, which is how a caret holds a format
 * — and a range is not bold when it straddles a bold run and a plain one. A node
 * selection reports what its whole subtree agrees on. A read, not a command:
 * nothing here changes anything.
 */
export const marksInRange = (
  document: Document,
  selection: Selection | null,
): ReadonlySet<string> => {
  if (selection === null) return new Set()
  if (selection.type === 'Node') {
    const found = locateBlock(document, selection.node)
    if (found === undefined) return new Set()
    const runs: Array<ReadonlyArray<RunMark>> = []
    eachBlock([found.block], each => {
      for (const run of each.children) runs.push(run.marks)
    })
    return sharedMarks(runs)
  }
  const bounds = ordered(document, selection)
  if (bounds === undefined) return new Set()
  if (isCollapsed(selection)) {
    const caret = locate(document, selection.anchor.node)
    return caret === undefined ? new Set() : sharedMarks([caret.marks])
  }
  return sharedMarks(covered(document, bounds.start, bounds.end).map(span => span.run.marks))
}

/** A mark around a caret, and the range of runs it spans. */
export interface MarkExtent {
  readonly mark: RunMark
  readonly selection: Extract<Selection, { readonly type: 'Range' }>
}

/**
 * The named mark on the run a position is in, and the adjacent runs of its block carrying
 * the same mark with the same props: the whole link a caret sits in, which is what a link
 * editor shows and what `SetMark` and `ClearMark` act on at a caret. Undefined when that
 * run does not carry the mark. A read, like `marksInRange`.
 */
export const markExtent = (
  document: Document,
  position: Position,
  name: string,
): MarkExtent | undefined => {
  const found = locateRun(document, position.node)
  const mark = found?.run.marks.find(held => markName(held) === name)
  if (found === undefined || mark === undefined) return undefined
  const runs = blockAtPath(document, found.path)!.children
  const carries = (index: number) => runs[index]?.marks.some(held => sameMark(held, mark)) === true
  let first = found.index
  while (carries(first - 1)) first--
  let last = found.index
  while (carries(last + 1)) last++
  const end = runs[last]!
  return {
    mark,
    selection: {
      type: 'Range',
      anchor: { node: runs[first]!.id, offset: 0, affinity: 'after' },
      focus: { node: end.id, offset: end.text.length, affinity: 'before' },
    },
  }
}

/**
 * The text style of the block a selection starts in, in the shape `RetypeBlock` takes, so a
 * style picker compares what it would send with what is there. Undefined for a node
 * selection, one that resolves to nothing, or a block a retype does not reach, such as a code
 * block.
 */
export const textBlockAt = (
  document: Document,
  selection: Selection | null,
): TextBlock | undefined => {
  if (selection?.type !== 'Range') return undefined
  const start = ordered(document, selection)?.start
  const found = start === undefined ? undefined : locateRun(document, start.node)
  const block = found === undefined ? undefined : blockAtPath(document, found.path)
  if (block?.type === 'Paragraph') return { type: 'Paragraph' }
  if (block?.type === 'Heading') return { type: 'Heading', level: block.level }
  return undefined
}

/** The last run in a block's subtree, or undefined when it holds none. */
const lastRunOf = (block: Block): Run | undefined => {
  if (block.type === 'Node' && block.blocks !== undefined) {
    for (let index = block.blocks.length - 1; index >= 0; index--) {
      const found = lastRunOf(block.blocks[index]!)
      if (found !== undefined) return found
    }
  }
  return block.children[block.children.length - 1]
}

/** The block list a path lives in: the document's, or a container's nested blocks. */
const containerBlocks = (document: Document, containerPath: BlockPath): ReadonlyArray<Block> => {
  if (containerPath.length === 0) return document.children
  const container = blockAtPath(document, containerPath)
  return container?.type === 'Node' && container.blocks !== undefined ? container.blocks : []
}

/**
 * Deletes an ordered [start, end): one operation per covered run, then the
 * blocks the range spanned are joined, so selecting across a paragraph boundary
 * and deleting removes the boundary too. The first block survives, which is
 * where the caret already is. Returns undefined when the range needs a join this
 * version cannot express — one across containers, which has no boundary to
 * remove — so the caller refuses rather than deleting half of what was selected.
 */
const deleteRange = (
  document: Document,
  start: Position,
  end: Position,
): ReadonlyArray<Operation> | undefined => {
  const startAt = locate(document, start.node)
  const endAt = locate(document, end.node)
  const deletions: Array<Operation> = covered(document, start, end).map(span =>
    Edit.deleteText(span.run.id, span.from, span.to),
  )
  if (startAt === undefined || endAt === undefined) return deletions
  // Within one block there is no boundary to remove.
  if (pathKey(startAt.path) === pathKey(endAt.path)) return deletions
  const containerPath = startAt.path.slice(0, -1)
  // The boundary only exists between siblings; a range that leaves its container
  // needs a merge this version does not define.
  if (pathKey(containerPath) !== pathKey(endAt.path.slice(0, -1))) return undefined
  const blocks = containerBlocks(document, containerPath)
  const from = startAt.path[startAt.path.length - 1]!
  const to = endAt.path[endAt.path.length - 1]!
  const survivor = blocks[from]!.id
  for (let index = from + 1; index <= to; index++) {
    const block = blocks[index]
    if (block !== undefined) deletions.push(Edit.joinBlocks(survivor, block.id))
  }
  return deletions
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/** A caret uses UTF-16 offsets, while a deletion removes a whole grapheme. */
const graphemeDeletion = (
  block: Block,
  caret: Position,
  runIndex: number,
  backward: boolean,
): { operations: ReadonlyArray<Operation>; caret: Position } | undefined => {
  const starts: Array<number> = []
  let length = 0
  for (const run of block.children) {
    starts.push(length)
    length += run.text.length
  }
  const at = starts[runIndex]! + caret.offset
  if (backward ? at === 0 : at === length) return undefined
  const text = block.children.map(run => run.text).join('')
  let from = 0
  let to = 0
  for (const segment of segmenter.segment(text)) {
    const end = segment.index + segment.segment.length
    if (backward ? end >= at : end > at) {
      from = segment.index
      to = end
      break
    }
  }
  const operations: Array<Operation> = []
  let graphemeStart: Position | undefined
  for (const [index, run] of block.children.entries()) {
    const start = starts[index]!
    const localFrom = Math.max(0, from - start)
    const localTo = Math.min(run.text.length, to - start)
    if (localFrom >= localTo) continue
    graphemeStart ??= { node: run.id, offset: localFrom, affinity: 'after' }
    operations.push(Edit.deleteText(run.id, localFrom, localTo))
  }
  if (graphemeStart === undefined) return undefined
  // A backward deletion removes what is to the caret's left, so the caret lands
  // where the grapheme began; a forward one removes to its right, and the caret
  // already sits at the surviving boundary.
  return { operations, caret: backward ? graphemeStart : caret }
}

/**
 * The operations that lift a block out of its container, or `undefined` when it is at the
 * top level with nothing to leave. One step moves it into the container's parent: before
 * the container when it was first, after it when it was last, and between the two halves
 * of a split container when it was in the middle. A container it leaves empty is deleted.
 * Steps repeat while the vocabulary says the new parent does not hold the block's kind;
 * without a vocabulary, one step is taken. A container the vocabulary declares isolating is
 * never left, so a lift that would start by leaving one lifts nothing.
 *
 * Each step is computed against the document the steps before it produced, applied with no
 * normalization, because a split or a deletion moves the indices the next step reads.
 */
const liftOperations = (
  document: Document,
  node: NodeId,
  ids: CommandIds,
  nodes: NodeRegistry | undefined,
): ReadonlyArray<Operation> | undefined => {
  const operations: Array<Operation> = []
  let current = document
  for (;;) {
    const found = locateBlock(current, node)
    if (found === undefined || found.path.length === 1) break
    const containerPath = found.path.slice(0, -1)
    const container = blockAtPath(current, containerPath)
    if (container?.type !== 'Node' || container.blocks === undefined) break
    const declared = nodes?.definitionFor(container.kind)
    if (declared?.kind === 'node' && declared.isolating === true) break
    const parentPath = containerPath.slice(0, -1)
    const parent = parentPath.length === 0 ? undefined : blockAtPath(current, parentPath)
    const at = containerPath[containerPath.length - 1]!
    const index = found.path[found.path.length - 1]!
    const siblings = container.blocks
    const step: Array<Operation> = []
    if (index === 0) {
      step.push(Edit.moveBlock(node, at, parent?.id))
      if (siblings.length === 1) step.push(Edit.deleteBlock(container.id))
    } else if (index === siblings.length - 1) {
      step.push(Edit.moveBlock(node, at + 1, parent?.id))
    } else {
      // The blocks after it go into a second container of the same kind, so the list or
      // quote continues on the far side of the lifted block.
      const rest = NodeId.make(ids.mint())
      step.push(
        Edit.insertBlock({ ...container, id: rest, children: [], blocks: [] }, at + 1, parent?.id),
        ...siblings
          .slice(index + 1)
          .map((sibling, offset) => Edit.moveBlock(sibling.id, offset, rest)),
        Edit.moveBlock(node, at + 1, parent?.id),
      )
    }
    const stepped = apply({ document: current, selection: null }, step, [])
    // Each step is built from the document it applies to, so a refusal is a bug here.
    if (!stepped.ok) throw new Error(`liftOperations: a lift step was refused (${stepped.error})`)
    operations.push(...step)
    current = stepped.state.document
    if (parent === undefined || kindAccepts(nodes, blockKind(parent), blockKind(found.block))) break
  }
  return operations.length === 0 ? undefined : operations
}

/** A list item around a block: its container, where that stands, and the list holding it. */
interface ItemAround {
  readonly container: Extract<Block, { readonly type: 'Node' }>
  readonly containerPath: BlockPath
  readonly list: Block
}

/**
 * The item a block sits in, when the vocabulary says its container is one: a kind its own
 * parent declares it holds, as a `List` declares `ListItem`, and not isolating, as a table
 * cell is. Enter treats such a container as the unit it splits.
 */
const itemAround = (
  document: Document,
  path: BlockPath,
  nodes: NodeRegistry | undefined,
): ItemAround | undefined => {
  if (nodes === undefined) return undefined
  const containerPath = path.slice(0, -1)
  const container = blockAtPath(document, containerPath)
  const list = blockAtPath(document, containerPath.slice(0, -1))
  if (container?.type !== 'Node' || list?.type !== 'Node') return undefined
  const declaredItem = nodes.definitionFor(container.kind)
  const isolating = declaredItem?.kind === 'node' && declaredItem.isolating === true
  return holdsItem(nodes, list.kind, container.kind) && !isolating
    ? { container, containerPath, list }
    : undefined
}

/**
 * Enter inside a list item. An empty block that is the item's whole content leaves the list,
 * as Backspace does. Otherwise the block splits and the second half, with every block after
 * it in the item, becomes a new item of the same kind and props right after this one.
 */
const splitItem = (
  state: EditorState,
  at: Located,
  offset: number,
  { container, containerPath, list }: ItemAround,
  ids: CommandIds,
  nodes: NodeRegistry | undefined,
): TransactionResult => {
  const blocks = container.blocks ?? []
  const index = at.path[at.path.length - 1]!
  const empty = blockAtPath(state.document, at.path)?.children.every(run => run.text === '')
  if (empty === true && blocks.length === 1) {
    return apply(state, liftOperations(state.document, at.blockId, ids, nodes) ?? [])
  }
  const textId = ids.mint()
  const blockId = ids.mint()
  const itemId = NodeId.make(ids.mint())
  return apply(state, [
    Edit.splitBlock(at.blockId, at.id, offset, blockId, textId),
    Edit.insertBlock(
      { ...container, id: itemId, children: [], blocks: [] },
      containerPath[containerPath.length - 1]! + 1,
      list.id,
    ),
    Edit.moveBlock(NodeId.make(blockId), 0, itemId),
    ...blocks
      .slice(index + 1)
      .map((later, position) => Edit.moveBlock(later.id, position + 1, itemId)),
    Edit.setSelection(caretAt({ node: NodeId.make(textId), offset: 0, affinity: 'after' })),
  ])
}

/** The block a block-level command acts on, and where it stands. */
interface StartingBlock {
  readonly block: Block
  readonly path: BlockPath
  readonly parentPath: BlockPath
  /** The containing block, or none at the document's top level. */
  readonly parent: Block | undefined
  /** The selection it was found from, which a command that renames runs has to move. */
  readonly selection: Extract<Selection, { readonly type: 'Range' }>
}

/**
 * A block-level intent acts on the block the selection starts in: the caret's own block,
 * or the first block of a range. Acting on every block a range covers would be a surprise,
 * and a menu or a marker is typed at a caret anyway.
 */
const startingBlock = (
  document: Document,
  selection: Extract<Selection, { readonly type: 'Range' }>,
): StartingBlock | { readonly error: Failure } => {
  const start = isCollapsed(selection) ? selection.anchor : ordered(document, selection)?.start
  if (start === undefined) return { error: 'InvalidSelection' }
  const at = locate(document, start.node)
  const block = at === undefined ? undefined : blockAtPath(document, at.path)
  if (at === undefined || block === undefined) return { error: 'MissingText' }
  const parentPath = at.path.slice(0, -1)
  return {
    block,
    path: at.path,
    parentPath,
    parent: parentPath.length === 0 ? undefined : blockAtPath(document, parentPath),
    selection,
  }
}

/** Retype, wrap, convert, and lift: each reshapes the starting block where it stands. */
const runBlockCommand = (
  state: EditorState,
  command: Extract<
    Command,
    { readonly type: 'RetypeBlock' | 'WrapBlock' | 'ConvertBlock' | 'LiftBlock' }
  >,
  { block, path, parentPath, parent, selection }: StartingBlock,
  ids: CommandIds,
  options: RunOptions,
): TransactionResult => {
  const index = path[path.length - 1]!
  if (command.type === 'LiftBlock') {
    const lifted = liftOperations(state.document, block.id, ids, options.nodes)
    return lifted === undefined ? failure('InvalidInput') : apply(state, lifted)
  }
  if (command.type === 'RetypeBlock') {
    // A retype keeps the block where it is, so the parent's constraint decides whether
    // the new kind belongs there.
    if (!acceptsChild(state.document, parentPath, command.to.type, options.nodes)) {
      return failure('UnexpectedChild')
    }
    return apply(state, [Edit.retypeBlock(block.id, command.to)])
  }

  if (command.type === 'WrapBlock') {
    const [outer] = command.containers
    if (outer === undefined) return failure('InvalidInput')
    if (command.containers.some(container => refusesProps(options.nodes, container))) {
      return failure('InvalidInput')
    }
    const kinds = [...command.containers.map(container => container.kind), blockKind(block)]
    const allowed =
      acceptsChild(state.document, parentPath, outer.kind, options.nodes) &&
      command.containers.every(
        (container, at) =>
          holdsBlocks(options.nodes, container.kind) &&
          kindAccepts(options.nodes, container.kind, kinds[at + 1]!),
      )
    if (!allowed) return failure('UnexpectedChild')
    // A list wrap right after a list of the same kind and props adds an item to it, as
    // Markdown reads the two; a second list beside the first would print as one.
    const siblings =
      parent === undefined
        ? state.document.children
        : parent.type === 'Node'
          ? (parent.blocks ?? [])
          : []
    const before = siblings[index - 1]
    const item = command.containers[1]
    const joins =
      options.nodes !== undefined &&
      item !== undefined &&
      holdsItem(options.nodes, outer.kind, item.kind) &&
      before?.type === 'Node' &&
      before.kind === outer.kind &&
      Equal.equals(before.props, outer.props ?? {})
    const created = joins ? command.containers.slice(1) : command.containers
    const containerIds = created.map(() => NodeId.make(ids.mint()))
    // Built from the inside out, so each container holds the next and the innermost is
    // empty until the block moves into it.
    const chain = created.reduceRight<Block | undefined>(
      (inner, container, at) => ({
        type: 'Node',
        kind: container.kind,
        id: containerIds[at]!,
        props: container.props ?? {},
        children: [],
        blocks: inner === undefined ? [] : [inner],
      }),
      undefined,
    )!
    return apply(state, [
      joins
        ? Edit.insertBlock(chain, before.blocks?.length ?? 0, before.id)
        : Edit.insertBlock(chain, index, parent?.id),
      Edit.moveBlock(block.id, 0, containerIds[containerIds.length - 1]!),
    ])
  }

  // A node kind's content is its Kit's contract, so only a paragraph or heading converts.
  if (block.type !== 'Paragraph' && block.type !== 'Heading') return failure('InvalidInput')
  const kind = command.to.kind
  if (refusesProps(options.nodes, command.to)) return failure('InvalidInput')
  const declared = options.nodes?.definitionFor(kind)
  const holdsText =
    options.nodes === undefined || (declared?.kind === 'node' && declared.children === textContent)
  if (!holdsText || !acceptsChild(state.document, parentPath, kind, options.nodes)) {
    return failure('UnexpectedChild')
  }
  if (
    options.nodes !== undefined &&
    kindForbidsMarks(options.nodes, kind) &&
    block.children.some(run => run.marks.length > 0)
  ) {
    return failure('ForbiddenMark')
  }
  const renamed = new Map(block.children.map(run => [run.id, NodeId.make(ids.mint())]))
  const converted: Block = {
    type: 'Node',
    kind,
    id: NodeId.make(ids.mint()),
    props: command.to.props ?? {},
    children: block.children.map(run => ({ ...run, id: renamed.get(run.id)! })),
  }
  const moved = (position: Position): Position => {
    const node = renamed.get(position.node)
    return node === undefined ? position : { ...position, node }
  }
  return apply(state, [
    Edit.deleteBlock(block.id),
    Edit.insertBlock(converted, index, parent?.id),
    Edit.setSelection({
      type: 'Range',
      anchor: moved(selection.anchor),
      focus: moved(selection.focus),
    }),
  ])
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
  // The vocabulary an edit may add: the caller's Kit, or the shipped marks.
  const declared = options.marks ?? shippedRegistry
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
    const marks: Array<RunMark> = []
    if (stored !== undefined) {
      for (const mark of stored) {
        if (!declared.accepts(mark)) return failure('InvalidInput')
        marks.push(mark)
      }
      // A mark-free kind refuses the format however it arrives, so inserting text
      // that carries marks into a CodeBlock is refused like the toggle that set them.
      if (marks.length > 0 && forbidsMarks(state.document, at.path, options.nodes)) {
        return failure('ForbiddenMark')
      }
    }
    const deletions = isCollapsed(selection)
      ? []
      : deleteRange(state.document, target, ordered(state.document, selection)!.end)
    if (deletions === undefined) return failure('InvalidParent')
    if (command.text.length === 0) {
      return apply(
        state,
        deletions.length === 0 ? [] : [...deletions, Edit.setSelection(caretAt(target))],
      )
    }
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
      if (!at.marks.some(existing => sameMark(existing, mark))) {
        operations.push(Edit.addMark(piece, mark))
      }
    }
    for (const mark of at.marks) {
      if (!marks.some(kept => markName(kept) === markName(mark))) {
        operations.push(Edit.removeMark(piece, markName(mark)))
      }
    }
    return apply(state, operations)
  }

  if (
    command.type === 'RetypeBlock' ||
    command.type === 'WrapBlock' ||
    command.type === 'ConvertBlock' ||
    command.type === 'LiftBlock'
  ) {
    const target = startingBlock(state.document, selection)
    return 'error' in target
      ? failure(target.error)
      : runBlockCommand(state, command, target, ids, options)
  }

  if (command.type === 'DeleteBackward' || command.type === 'DeleteForward') {
    if (!isCollapsed(selection)) {
      const span = ordered(state.document, selection)
      if (span === undefined) return failure('InvalidSelection')
      const deletions = deleteRange(state.document, span.start, span.end)
      if (deletions === undefined) return failure('InvalidParent')
      return apply(state, [...deletions, Edit.setSelection(caretAt(span.start))])
    }
    const caret = selection.anchor
    const at = locate(state.document, caret.node)
    if (at === undefined) return failure('MissingText')
    const backward = command.type === 'DeleteBackward'
    const block = blockAtPath(state.document, at.path)
    if (block === undefined) return failure('MissingText')
    const deletion = graphemeDeletion(block, caret, at.runIndex, backward)
    if (deletion !== undefined) {
      return apply(state, [...deletion.operations, Edit.setSelection(caretAt(deletion.caret))])
    }
    // A block edge joins the sibling in the same container, wherever it sits.
    const containerPath = at.path.slice(0, -1)
    const siblings = containerBlocks(state.document, containerPath)
    const index = at.path[at.path.length - 1]!
    const neighborBlock = siblings[backward ? index - 1 : index + 1]
    if (neighborBlock === undefined) {
      // Backspace at the start of a container's first block has nothing to join with, so
      // it lifts the block out, undoing what `> ` or `- ` did. Only with a vocabulary: it
      // is what says a list item's paragraph must leave the list too, and a table cell must
      // not be left at all. Otherwise, and forward, the edge stays a no-op.
      const lifted =
        backward && containerPath.length > 0 && options.nodes !== undefined
          ? liftOperations(state.document, siblings[index]!.id, ids, options.nodes)
          : undefined
      return apply(state, lifted ?? [])
    }
    const survivor = backward ? neighborBlock : siblings[index]!
    const removed = backward ? siblings[index]! : neighborBlock
    // The caret lands at the junction: the end of what the survivor already had,
    // or the removed block's last run when the survivor holds no runs.
    const lastRun = lastRunOf(survivor) ?? lastRunOf(removed)
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
    const deletions = span === undefined ? [] : deleteRange(state.document, span.start, span.end)
    if (deletions === undefined) return failure('InvalidParent')
    const item = itemAround(state.document, at.path, options.nodes)
    if (item !== undefined) {
      // Over a range inside an item, Enter deletes the range and then splits the item, as it
      // would at a caret; the two commands already say how.
      return span === undefined
        ? splitItem(state, at, caret.offset, item, ids, options.nodes)
        : runAction(state, [{ type: 'DeleteBackward' }, { type: 'SplitBlock' }], ids, options)
    }
    const textId = ids.mint()
    return apply(state, [
      ...deletions,
      Edit.splitBlock(at.blockId, at.id, caret.offset, ids.mint(), textId),
      Edit.setSelection(caretAt({ node: NodeId.make(textId), offset: 0, affinity: 'after' })),
    ])
  }

  if (command.type === 'ToggleMark' || command.type === 'SetMark' || command.type === 'ClearMark') {
    const mark = command.mark
    const name = markName(mark)
    let span = ordered(state.document, selection)
    if (isCollapsed(selection)) {
      // A toggle at a caret has nothing to cover; setting or clearing one acts on the mark
      // the caret is in, so a link can be edited without selecting it first.
      const extent =
        command.type === 'ToggleMark'
          ? undefined
          : markExtent(state.document, selection.anchor, name)
      if (extent === undefined) return apply(state, [])
      span = ordered(state.document, extent.selection)
    }
    if (span === undefined) return failure('InvalidSelection')
    const spans = covered(state.document, span.start, span.end)
    if (spans.length === 0) return apply(state, [])
    // A toggle keys on the name: the mark is present on every covered run, or
    // it is absent everywhere. Props are the mark's own business.
    const adding =
      command.type === 'SetMark' ||
      (command.type === 'ToggleMark' &&
        !spans.every(entry => entry.run.marks.some(held => markName(held) === name)))
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
      // Adding needs the vocabulary to declare the mark and accept its props; removing a
      // preserved one by name is always allowed.
      if (!declared.accepts(mark)) return failure('InvalidInput')
      if (spans.some(entry => forbidsMarks(state.document, entry.run.path, options.nodes))) {
        return failure('ForbiddenMark')
      }
      for (const target of targets) operations.push(Edit.addMark(target, mark))
    } else {
      for (const target of targets) operations.push(Edit.removeMark(target, name))
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
    const index = at.path[at.path.length - 1]!
    const containerPath = at.path.slice(0, -1)
    // The content lands in the caret's own container, so pasting inside a list
    // item stays inside the list.
    const parent =
      containerPath.length === 0 ? undefined : blockAtPath(state.document, containerPath)?.id
    const replacements = span === undefined ? [] : deleteRange(state.document, span.start, span.end)
    if (replacements === undefined) return failure('InvalidParent')
    const operations: Array<Operation> = [...replacements]
    const inserted = withFreshIds(command.slice, ids.mint).blocks
    // The content lands in the caret's container, so that container's constraint
    // decides which kinds it accepts (§125).
    if (
      containerPath.length > 0 &&
      inserted.some(
        piece => !acceptsChild(state.document, containerPath, blockKind(piece), options.nodes),
      )
    ) {
      return failure('UnexpectedChild')
    }
    const block = blockAtPath(state.document, at.path)
    if (block === undefined) return failure('MissingText')
    const atBlockStart = at.runIndex === 0 && caret.offset === 0
    const atBlockEnd = at.runIndex === block.children.length - 1 && caret.offset === at.text.length
    let trailingRun: NodeId | undefined
    if (atBlockStart) {
      // Pasting at the very start puts the content above this block.
      for (const [offset, piece] of inserted.entries()) {
        operations.push(Edit.insertBlock(piece, index + offset, parent))
      }
    } else if (atBlockEnd) {
      for (const [offset, piece] of inserted.entries()) {
        operations.push(Edit.insertBlock(piece, index + 1 + offset, parent))
      }
    } else {
      // Mid-block: split the block at the caret and land the content between
      // the halves, so the text after the caret stays below what was pasted.
      const textId = ids.mint()
      operations.push(Edit.splitBlock(at.blockId, at.id, caret.offset, ids.mint(), textId))
      trailingRun = NodeId.make(textId)
      for (const [offset, piece] of inserted.entries()) {
        operations.push(Edit.insertBlock(piece, index + 1 + offset, parent))
      }
    }
    const landing = landingAfter(
      inserted,
      trailingRun,
      containerBlocks(state.document, containerPath),
      index,
      atBlockEnd,
    )
    if (landing !== undefined) operations.push(Edit.setSelection(caretAt(landing)))
    return apply(state, operations)
  }

  return apply(state, [])
}

/**
 * Where the caret goes after a paste: the end of the last inserted run, or the
 * start of what follows when the inserted content ends without text — the
 * trailing half a split created, then the next sibling.
 */
const landingAfter = (
  inserted: ReadonlyArray<Block>,
  trailingRun: NodeId | undefined,
  siblings: ReadonlyArray<Block>,
  index: number,
  atBlockEnd: boolean,
): Position | undefined => {
  const last = inserted[inserted.length - 1]!
  const lastRun = last.children[last.children.length - 1]
  if (lastRun !== undefined) {
    return { node: lastRun.id, offset: lastRun.text.length, affinity: 'after' }
  }
  if (trailingRun !== undefined) return { node: trailingRun, offset: 0, affinity: 'after' }
  const following = siblings[index + (atBlockEnd ? 1 : 0)]
  const followingRun = following?.children[0]
  return followingRun === undefined
    ? undefined
    : { node: followingRun.id, offset: 0, affinity: 'after' }
}

/** An ordered list of commands that commit as one action (§124 §5). */
export type Action = ReadonlyArray<Command>

/**
 * A composed action's invalidation summary is the union of its commands': an identity
 * one command retired and a later one restored appears in both sets, and a patch reads
 * that as "remove it, then render it", so it never under-invalidates.
 */
const unionChangeSet = (left: ChangeSet, right: ChangeSet): ChangeSet => ({
  dirtyNodes: new Set([...left.dirtyNodes, ...right.dirtyNodes]),
  insertedNodes: new Set([...left.insertedNodes, ...right.insertedNodes]),
  removedNodes: new Set([...left.removedNodes, ...right.removedNodes]),
  textChanged: new Set([...left.textChanged, ...right.textChanged]),
  structureChanged: left.structureChanged || right.structureChanged,
  selectionChanged: left.selectionChanged || right.selectionChanged,
})

/**
 * Resolves commands in order and commits them as one action: one resulting state, one
 * composed ChangeSet, and one identity stream, so a caller can treat "remove the query,
 * then apply the choice" as a single transition. It stops at the first refusal and
 * returns that command's error; state is a value, so nothing partial escapes.
 */
export const runAction = (
  state: EditorState,
  commands: Action,
  ids: CommandIds,
  options: RunOptions = {},
): TransactionResult => {
  const [first, ...rest] = commands
  // An empty action is a no-op, as an empty transaction is.
  if (first === undefined) return apply(state, [])
  const started = run(state, first, ids, options)
  if (!started.ok) return started
  let current = started.state
  let changeSet = started.changeSet
  let positionMap = started.positionMap
  for (const command of rest) {
    const result = run(current, command, ids, options)
    if (!result.ok) return result
    current = result.state
    changeSet = unionChangeSet(changeSet, result.changeSet)
    positionMap = [...positionMap, ...result.positionMap]
  }
  return { ok: true, state: current, changeSet, positionMap }
}
