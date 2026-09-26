import { Equal, Schema } from 'effect'
import { markName, sameMark } from './marks.js'
import {
  Block,
  eachBlock,
  EditorState,
  NodeId,
  Position,
  RunMark,
  Selection,
  compareRunPlaces,
  selectionIsValid,
  type BlockPath,
  type Document,
  type NodeReference,
  type Text,
} from './document.js'
import { defaultTransforms, type Transform } from './transform.js'

/** How many normalization passes a transaction may spend before it gives up. */
export const MAX_NORMALIZATION_PASSES = 10

const Offset = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))

const InsertTextOperation = Schema.Struct({
  type: Schema.Literal('InsertText'),
  at: Position,
  text: Schema.String,
})
const DeleteTextOperation = Schema.Struct({
  type: Schema.Literal('DeleteText'),
  node: NodeId,
  from: Offset,
  to: Offset,
})
const AddMarkOperation = Schema.Struct({
  type: Schema.Literal('AddMark'),
  node: NodeId,
  mark: RunMark,
})
const RemoveMarkOperation = Schema.Struct({
  type: Schema.Literal('RemoveMark'),
  node: NodeId,
  mark: Schema.String,
})
const SetSelectionOperation = Schema.Struct({
  type: Schema.Literal('SetSelection'),
  selection: Schema.NullOr(Selection),
})
const SplitNodeOperation = Schema.Struct({
  type: Schema.Literal('SplitNode'),
  block: NodeId,
  node: NodeId,
  offset: Offset,
  blockId: NodeId,
  textId: NodeId,
})
const JoinNodeOperation = Schema.Struct({
  type: Schema.Literal('JoinNode'),
  into: NodeId,
  removed: NodeId,
})
const MoveNodeOperation = Schema.Struct({
  type: Schema.Literal('MoveNode'),
  node: NodeId,
  to: Offset,
  /** The block list to move into: a node block's, or the document's when absent. */
  parent: Schema.optionalKey(NodeId),
})
/**
 * What a text block retypes to: a paragraph, or a heading at a level. Its runs are
 * its own and survive the change; only the block's type does not.
 */
export const TextBlock = Schema.Union([
  Schema.Struct({ type: Schema.Literal('Paragraph') }),
  Schema.Struct({ type: Schema.Literal('Heading'), level: Schema.Literals([1, 2, 3, 4, 5, 6]) }),
])
export type TextBlock = typeof TextBlock.Type

const RetypeBlockOperation = Schema.Struct({
  type: Schema.Literal('RetypeBlock'),
  node: NodeId,
  to: TextBlock,
})
const InsertNodeOperation = Schema.Struct({
  type: Schema.Literal('InsertNode'),
  block: Block,
  at: Offset,
  /** The block list to insert into: a node block's, or the document's when absent. */
  parent: Schema.optionalKey(NodeId),
})
const DeleteNodeOperation = Schema.Struct({
  type: Schema.Literal('DeleteNode'),
  node: NodeId,
})
const SplitRunOperation = Schema.Struct({
  type: Schema.Literal('SplitRun'),
  node: NodeId,
  offset: Offset,
  textId: NodeId,
})

export const Operation = Schema.Union([
  InsertTextOperation,
  DeleteTextOperation,
  AddMarkOperation,
  RemoveMarkOperation,
  SetSelectionOperation,
  SplitNodeOperation,
  JoinNodeOperation,
  MoveNodeOperation,
  RetypeBlockOperation,
  InsertNodeOperation,
  DeleteNodeOperation,
  SplitRunOperation,
])
export type Operation = typeof Operation.Type
export const Transaction = Schema.Array(Operation)
export type Transaction = typeof Transaction.Type

/** A text-run target: a validated id or a reusable node reference. */
export type TextTarget = NodeId | NodeReference

const targetId = (target: TextTarget): NodeId => (typeof target === 'string' ? target : target.id)

/** Accepts a raw string or validated id; empty strings throw via `NodeId`. */
const freshId = (id: string | NodeId): NodeId => (typeof id === 'string' ? NodeId.make(id) : id)

/**
 * Typesafe constructors for transaction operations. Each builder accepts a
 * `NodeId` or a `Node.make` reference and validates shape immediately
 * (misuse throws), while document-dependent checks — node kind, existence,
 * bounds, selection resolution — remain `apply` diagnostics. Compose with
 * `Node.at` for positions: `Edit.insertText(Text.at(5, 'after'), '!')`.
 */
export const Edit = {
  insertText: (at: Position, text: string): Extract<Operation, { readonly type: 'InsertText' }> =>
    InsertTextOperation.make({ type: 'InsertText', at, text }),

  deleteText: (
    node: TextTarget,
    from: number,
    to: number,
  ): Extract<Operation, { readonly type: 'DeleteText' }> => {
    if (from > to) throw new Error(`Edit.deleteText: from (${from}) must not exceed to (${to})`)
    return DeleteTextOperation.make({ type: 'DeleteText', node: targetId(node), from, to })
  },

  addMark: (node: TextTarget, mark: RunMark): Extract<Operation, { readonly type: 'AddMark' }> =>
    AddMarkOperation.make({ type: 'AddMark', node: targetId(node), mark }),

  removeMark: (
    node: TextTarget,
    mark: string,
  ): Extract<Operation, { readonly type: 'RemoveMark' }> =>
    RemoveMarkOperation.make({ type: 'RemoveMark', node: targetId(node), mark }),

  setSelection: (
    selection: Selection | null,
  ): Extract<Operation, { readonly type: 'SetSelection' }> =>
    SetSelectionOperation.make({ type: 'SetSelection', selection }),

  splitBlock: (
    block: TextTarget,
    node: TextTarget,
    offset: number,
    newBlock: string | NodeId,
    newRun: string | NodeId,
  ): Extract<Operation, { readonly type: 'SplitNode' }> =>
    SplitNodeOperation.make({
      type: 'SplitNode',
      block: targetId(block),
      node: targetId(node),
      offset,
      blockId: freshId(newBlock),
      textId: freshId(newRun),
    }),

  joinBlocks: (
    survivor: TextTarget,
    removed: TextTarget,
  ): Extract<Operation, { readonly type: 'JoinNode' }> =>
    JoinNodeOperation.make({
      type: 'JoinNode',
      into: targetId(survivor),
      removed: targetId(removed),
    }),

  moveBlock: (
    node: TextTarget,
    to: number,
    parent?: TextTarget,
  ): Extract<Operation, { readonly type: 'MoveNode' }> =>
    MoveNodeOperation.make({
      type: 'MoveNode',
      node: targetId(node),
      to,
      ...(parent === undefined ? {} : { parent: targetId(parent) }),
    }),

  retypeBlock: (
    node: TextTarget,
    to: TextBlock,
  ): Extract<Operation, { readonly type: 'RetypeBlock' }> =>
    RetypeBlockOperation.make({ type: 'RetypeBlock', node: targetId(node), to }),

  insertBlock: (
    block: Block,
    at: number,
    parent?: TextTarget,
  ): Extract<Operation, { readonly type: 'InsertNode' }> =>
    InsertNodeOperation.make({
      type: 'InsertNode',
      block,
      at,
      ...(parent === undefined ? {} : { parent: targetId(parent) }),
    }),

  deleteBlock: (node: TextTarget): Extract<Operation, { readonly type: 'DeleteNode' }> =>
    DeleteNodeOperation.make({ type: 'DeleteNode', node: targetId(node) }),

  splitRun: (
    node: TextTarget,
    offset: number,
    newRun: string | NodeId,
  ): Extract<Operation, { readonly type: 'SplitRun' }> =>
    SplitRunOperation.make({
      type: 'SplitRun',
      node: targetId(node),
      offset,
      textId: freshId(newRun),
    }),
}

export interface ChangeSet {
  readonly dirtyNodes: ReadonlySet<NodeId>
  readonly insertedNodes: ReadonlySet<NodeId>
  readonly removedNodes: ReadonlySet<NodeId>
  readonly textChanged: ReadonlySet<NodeId>
  readonly structureChanged: boolean
  readonly selectionChanged: boolean
}

/** One replacement of [from, to) with inserted UTF-16 units, in sequential coordinates. */
export interface PositionStep {
  readonly node: NodeId
  readonly from: number
  readonly to: number
  readonly inserted: number
}

/**
 * Split relocation: offsets > at move to into with offset - at; offset == at
 * follows affinity (before stays, after moves to 0); lower offsets stay.
 */
export interface SplitStep {
  readonly node: NodeId
  readonly into: NodeId
  readonly at: number
}

/**
 * Merge relocation: offsets >= at move to into with base + offset - at;
 * lower offsets stay. Affinity is preserved, not consulted: the source
 * location ceases to exist, so every endpoint must move.
 */
export interface RelocateStep {
  readonly node: NodeId
  readonly into: NodeId
  readonly at: number
  readonly base: number
}

/**
 * Deletion collapse: every offset in node moves to offset 0 of into;
 * affinity is preserved. Emitted per removed run when a surviving run exists;
 * with no text left, positions cannot map and selection clears instead.
 */
export interface CollapseStep {
  readonly node: NodeId
  readonly into: NodeId
}

/** Maps a position through each edit, preserving insertion affinity. */
export const mapPosition = (
  position: Position,
  steps: ReadonlyArray<PositionStep | SplitStep | RelocateStep | CollapseStep>,
): Position =>
  steps.reduce((current, step) => {
    if (current.node !== step.node) return current
    if ('base' in step) {
      if (current.offset < step.at) return current
      return { ...current, node: step.into, offset: step.base + current.offset - step.at }
    }
    if ('at' in step) {
      if (current.offset < step.at) return current
      if (current.offset === step.at && current.affinity === 'before') return current
      return { ...current, node: step.into, offset: current.offset - step.at }
    }
    if ('into' in step) {
      return { ...current, node: step.into, offset: 0 }
    }
    if (current.offset < step.from) return current
    const offset =
      current.offset > step.to
        ? current.offset + step.inserted - (step.to - step.from)
        : step.from + (current.affinity === 'after' ? step.inserted : 0)
    return offset === current.offset ? current : { ...current, offset }
  }, position)

/**
 * Maps a whole selection through steps: both range endpoints, or a node target
 * whose identity a step relocated. Steps that only replace text have no `into`,
 * so a node selection is unaffected by them.
 */
export const mapThrough = (
  selection: Selection | null,
  steps: ReadonlyArray<PositionStep | SplitStep | RelocateStep | CollapseStep>,
): Selection | null => {
  if (selection === null) return null
  if (selection.type === 'Node') {
    const step = steps.find(candidate => 'into' in candidate && candidate.node === selection.node)
    return step === undefined || !('into' in step) ? selection : { ...selection, node: step.into }
  }
  return {
    ...selection,
    anchor: mapPosition(selection.anchor, steps),
    focus: mapPosition(selection.focus, steps),
  }
}

export type TransactionResult =
  | {
      readonly ok: true
      readonly state: EditorState
      readonly changeSet: ChangeSet
      readonly positionMap: ReadonlyArray<PositionStep | SplitStep | RelocateStep | CollapseStep>
    }
  | {
      readonly ok: false
      readonly error:
        | 'InvalidInput'
        | 'MissingText'
        | 'MissingNode'
        | 'InvalidRange'
        | 'InvalidSelection'
        | 'InvalidParent'
        | 'ForbiddenMark'
        | 'UnexpectedChild'
        | 'UnstableNormalization'
    }

const decodeState = Schema.decodeUnknownSync(EditorState, { onExcessProperty: 'error' })
const decodeTransaction = Schema.decodeUnknownSync(Transaction, { onExcessProperty: 'error' })
const sameSelection = (left: Selection | null, right: Selection | null): boolean => {
  if (left === null || right === null) return left === right
  if (left.type === 'Node') return right.type === 'Node' && left.node === right.node
  if (right.type !== 'Range') return false
  return (['anchor', 'focus'] as const).every(
    key =>
      left[key].node === right[key].node &&
      left[key].offset === right[key].offset &&
      left[key].affinity === right[key].affinity,
  )
}

/** The nested block list of a container, or undefined for any other block. */
const nestedOf = (block: Block): ReadonlyArray<Block> | undefined =>
  block.type === 'Node' && block.blocks !== undefined ? block.blocks : undefined

/**
 * A block's address: root-first container indices. `[2]` is the third top-level
 * block; `[2, 0]` is the first block nested inside it (§116). The document's own
 * block list is the container at `[]`.
 */
const pathKey = (path: BlockPath): string => path.join('.')
const keyToPath = (key: string): BlockPath => (key === '' ? [] : key.split('.').map(Number))

/**
 * Pure, atomic text transaction. Rejection returns no partially edited state.
 * `transforms` defaults to the registry's shipped rules; a Kit's transforms
 * arrive here when Kit support lands.
 */
export const apply = (
  state: EditorState,
  transaction: Transaction,
  transforms: ReadonlyArray<Transform> = defaultTransforms,
): TransactionResult => {
  try {
    decodeState(state)
    decodeTransaction(transaction)
  } catch {
    return { ok: false, error: 'InvalidInput' }
  }
  const indexDocument = (current: Document) => {
    const blockPaths = new Map<NodeId, BlockPath>()
    const runPaths = new Map<NodeId, { readonly path: BlockPath; readonly index: number }>()
    eachBlock(current.children, (block, path) => {
      blockPaths.set(block.id, path)
      for (const [runIndex, run] of block.children.entries()) {
        runPaths.set(run.id, { path, index: runIndex })
      }
    })
    return { blockPaths, runPaths }
  }
  let { blockPaths, runPaths } = indexDocument(state.document)
  const reindex = () => {
    ;({ blockPaths, runPaths } = indexDocument(document))
  }
  // Identities stay reserved for the whole transaction so a reused id can never
  // silently address two nodes across structural edits.
  const usedIds = new Set<NodeId>([...runPaths.keys(), ...blockPaths.keys()])
  let document: Document = state.document
  // Working copies: each touched container is copied once per transaction, so N
  // edits in one paragraph cost O(N) rather than N copies of the same array. A
  // container is a block list — the document's, or a node block's nested blocks —
  // and a block's runs are copied separately, keyed by that block's path.
  const workingBlocks = new Map<string, Array<Block>>()
  const workingRuns = new Map<string, Array<Text>>()
  const blockAt = (path: BlockPath): Block | undefined =>
    blocksAt(path.slice(0, -1))[path[path.length - 1]!]
  /** The block list at a container path, reading through any pending copy. */
  function blocksAt(containerPath: BlockPath): ReadonlyArray<Block> {
    const pending = workingBlocks.get(pathKey(containerPath))
    if (pending !== undefined) return pending
    if (containerPath.length === 0) return document.children
    const parent = blockAt(containerPath)
    return parent?.type === 'Node' && parent.blocks !== undefined ? parent.blocks : []
  }
  /** Copies a container, and its ancestors, once: writes never touch the input. */
  const ensureContainer = (containerPath: BlockPath): Array<Block> => {
    const key = pathKey(containerPath)
    const existing = workingBlocks.get(key)
    if (existing !== undefined) return existing
    if (containerPath.length > 0) ensureContainer(containerPath.slice(0, -1))
    const copy = [...blocksAt(containerPath)]
    workingBlocks.set(key, copy)
    return copy
  }
  /** The block's runs as they stand: a pending copy if one exists, else the document's. */
  const runsAt = (path: BlockPath): ReadonlyArray<Text> =>
    workingRuns.get(pathKey(path)) ?? blockAt(path)?.children ?? []
  /** The block's run array, copied on first write and mutated in place after. */
  const runArray = (path: BlockPath): Array<Text> => {
    const key = pathKey(path)
    const existing = workingRuns.get(key)
    if (existing !== undefined) return existing
    ensureContainer(path.slice(0, -1))
    const copy = [...(blockAt(path)?.children ?? [])]
    workingRuns.set(key, copy)
    return copy
  }
  const writeBlock = (path: BlockPath, block: Block): void => {
    const container = ensureContainer(path.slice(0, -1))
    container[path[path.length - 1]!] = block
  }
  /**
   * The block list a structural operation targets: the document's, or a node
   * block's nested blocks. A parent that cannot hold blocks is `InvalidParent`,
   * one that does not exist is `MissingNode`.
   */
  const containerPathOf = (
    parent: NodeId | undefined,
  ): { readonly path: BlockPath } | { readonly error: 'MissingNode' | 'InvalidParent' } => {
    if (parent === undefined) return { path: [] }
    const path = blockPaths.get(parent)
    if (path === undefined) return { error: 'MissingNode' }
    const block = blockAt(path)
    return block?.type === 'Node' && block.blocks !== undefined
      ? { path }
      : { error: 'InvalidParent' }
  }
  const materialize = (): void => {
    if (workingBlocks.size === 0 && workingRuns.size === 0) return
    // Runs fold into their block, then each container folds into its parent. A
    // container's copy already holds its child's final value, so the order of
    // the second pass does not matter; only touched containers are visited.
    for (const [key, runs] of workingRuns) {
      const path = keyToPath(key)
      const container = workingBlocks.get(pathKey(path.slice(0, -1)))!
      const index = path[path.length - 1]!
      container[index] = { ...container[index]!, children: runs }
    }
    workingRuns.clear()
    for (const [key, blocks] of workingBlocks) {
      const path = keyToPath(key)
      if (path.length === 0) {
        document = { ...document, children: blocks }
        continue
      }
      const parent = workingBlocks.get(pathKey(path.slice(0, -1)))!
      const index = path[path.length - 1]!
      const parentBlock = parent[index]!
      // Only a node block holds nested blocks, and only its path can be a
      // container, so this narrowing always holds.
      if (parentBlock.type === 'Node') parent[index] = { ...parentBlock, blocks }
    }
    workingBlocks.clear()
  }
  let selection = state.selection
  const dirtyNodes = new Set<NodeId>()
  const insertedNodes = new Set<NodeId>()
  const removedNodes = new Set<NodeId>()
  const textChanged = new Set<NodeId>()
  let structureChanged = false
  const positionMap: Array<PositionStep | SplitStep | RelocateStep | CollapseStep> = []
  for (let operationIndex = 0; operationIndex < transaction.length; operationIndex++) {
    const operation = transaction[operationIndex]!
    if (operation.type === 'SetSelection') {
      // A pending edit could change what a position resolves against.
      materialize()
      if (!selectionIsValid(document, operation.selection)) {
        return { ok: false, error: 'InvalidSelection' }
      }
      selection = operation.selection
      continue
    }
    if (operation.type === 'SplitRun') {
      const location = runPaths.get(operation.node)
      if (location === undefined) return { ok: false, error: 'MissingText' }
      const { path, index: textIndex } = location
      const target = blockAt(path)
      if (target === undefined) return { ok: false, error: 'MissingText' }
      const run = runsAt(path)[textIndex]!
      if (operation.offset > run.text.length) return { ok: false, error: 'InvalidRange' }
      if (usedIds.has(operation.textId)) return { ok: false, error: 'InvalidInput' }
      if (operation.offset === 0) {
        // No left remainder: the new run would be an empty duplicate. Splitting
        // at 0 is the caller's no-op, not a silent identity change.
        continue
      }
      const children = runArray(path)
      children[textIndex] = { ...run, text: run.text.slice(0, operation.offset) }
      children.splice(textIndex + 1, 0, {
        ...run,
        id: operation.textId,
        text: run.text.slice(operation.offset),
      })
      usedIds.add(operation.textId)
      materialize()
      reindex()
      const relocate: SplitStep = {
        node: run.id,
        into: operation.textId,
        at: operation.offset,
      }
      positionMap.push(relocate)
      if (selection?.type === 'Range') {
        selection = {
          ...selection,
          anchor: mapPosition(selection.anchor, [relocate]),
          focus: mapPosition(selection.focus, [relocate]),
        }
      }
      dirtyNodes.add(target.id)
      dirtyNodes.add(run.id)
      dirtyNodes.add(operation.textId)
      textChanged.add(run.id)
      textChanged.add(operation.textId)
      insertedNodes.add(operation.textId)
      continue
    }
    if (operation.type === 'SplitNode') {
      materialize()
      const blockPath = blockPaths.get(operation.block)
      if (blockPath === undefined) return { ok: false, error: 'MissingNode' }
      const runLocation = runPaths.get(operation.node)
      if (runLocation === undefined) return { ok: false, error: 'MissingText' }
      const { path: runBlockPath, index: textIndex } = runLocation
      if (pathKey(runBlockPath) !== pathKey(blockPath)) return { ok: false, error: 'InvalidRange' }
      const target = blockAt(blockPath)!
      const run = target.children[textIndex]!
      if (operation.offset > run.text.length) return { ok: false, error: 'InvalidRange' }
      if (
        usedIds.has(operation.blockId) ||
        usedIds.has(operation.textId) ||
        operation.blockId === operation.textId
      ) {
        return { ok: false, error: 'InvalidInput' }
      }
      const leftBlock = {
        ...target,
        children: [
          ...target.children.slice(0, textIndex),
          { ...run, text: run.text.slice(0, operation.offset) },
        ],
      }
      const rightBlock = {
        ...target,
        id: operation.blockId,
        children: [
          { ...run, id: operation.textId, text: run.text.slice(operation.offset) },
          ...target.children.slice(textIndex + 1),
        ],
      }
      // The halves land in the block's own container, so a split inside a
      // container stays inside it.
      const containerPath = blockPath.slice(0, -1)
      const index = blockPath[blockPath.length - 1]!
      const container = ensureContainer(containerPath)
      container[index] = leftBlock
      container.splice(index + 1, 0, rightBlock)
      materialize()
      usedIds.add(operation.blockId)
      usedIds.add(operation.textId)
      reindex()
      const relocate: SplitStep = { node: run.id, into: operation.textId, at: operation.offset }
      positionMap.push(relocate)
      if (selection?.type === 'Range') {
        selection = {
          ...selection,
          anchor: mapPosition(selection.anchor, [relocate]),
          focus: mapPosition(selection.focus, [relocate]),
        }
      }
      dirtyNodes.add(target.id)
      dirtyNodes.add(operation.blockId)
      dirtyNodes.add(run.id)
      dirtyNodes.add(operation.textId)
      for (const moved of target.children.slice(textIndex + 1)) dirtyNodes.add(moved.id)
      textChanged.add(run.id)
      textChanged.add(operation.textId)
      insertedNodes.add(operation.blockId)
      insertedNodes.add(operation.textId)
      structureChanged = true
      continue
    }
    if (operation.type === 'JoinNode') {
      materialize()
      const intoPath = blockPaths.get(operation.into)
      if (intoPath === undefined) return { ok: false, error: 'MissingNode' }
      const removedPath = blockPaths.get(operation.removed)
      if (removedPath === undefined) return { ok: false, error: 'MissingNode' }
      // Siblings only: two blocks in different containers have no boundary
      // between them to remove.
      if (pathKey(intoPath.slice(0, -1)) !== pathKey(removedPath.slice(0, -1))) {
        return { ok: false, error: 'InvalidParent' }
      }
      const containerPath = intoPath.slice(0, -1)
      const intoIndex = intoPath[intoPath.length - 1]!
      const removedIndex = removedPath[removedPath.length - 1]!
      if (removedIndex !== intoIndex + 1) return { ok: false, error: 'InvalidRange' }
      const container = ensureContainer(containerPath)
      const survivor = container[intoIndex]!
      const removedBlocks: Array<Block> = []
      while (operationIndex < transaction.length) {
        const next = transaction[operationIndex]
        if (next?.type !== 'JoinNode' || next.into !== operation.into) break
        const removed = container[intoIndex + removedBlocks.length + 1]
        if (removed?.id !== next.removed) break
        // Opaque content cannot be merged without silently discarding it.
        if (survivor.type === 'Unknown' || removed.type === 'Unknown') {
          return { ok: false, error: 'InvalidRange' }
        }
        if (survivor.type === 'Node' || removed.type === 'Node') {
          if (
            survivor.type !== 'Node' ||
            removed.type !== 'Node' ||
            survivor.kind !== removed.kind ||
            !Equal.equals(survivor.props, removed.props)
          )
            return { ok: false, error: 'InvalidRange' }
        }
        // A container and a run holder merge differently: joining a list with a
        // paragraph would have to drop one side's shape.
        if ((nestedOf(survivor) === undefined) !== (nestedOf(removed) === undefined)) {
          return { ok: false, error: 'InvalidRange' }
        }
        removedBlocks.push(removed)
        operationIndex++
      }
      operationIndex--
      const mergedRuns = [...survivor.children, ...removedBlocks.flatMap(block => block.children)]
      if (survivor.type === 'Node' && survivor.blocks !== undefined) {
        container[intoIndex] = {
          ...survivor,
          children: mergedRuns,
          blocks: [...survivor.blocks, ...removedBlocks.flatMap(block => nestedOf(block) ?? [])],
        }
      } else {
        container[intoIndex] = { ...survivor, children: mergedRuns }
      }
      container.splice(removedIndex, removedBlocks.length)
      materialize()
      reindex()
      for (const removed of removedBlocks) {
        // A Node selection on a retired identity follows the survivor.
        if (selection?.type === 'Node' && selection.node === removed.id) {
          selection = { ...selection, node: operation.into }
        }
      }
      dirtyNodes.add(operation.into)
      for (const removed of removedBlocks) {
        dirtyNodes.add(removed.id)
        removedNodes.add(removed.id)
        for (const moved of removed.children) dirtyNodes.add(moved.id)
      }
      structureChanged = true
      continue
    }
    if (operation.type === 'MoveNode') {
      materialize()
      const fromPath = blockPaths.get(operation.node)
      if (fromPath === undefined) return { ok: false, error: 'MissingNode' }
      const target = containerPathOf(operation.parent)
      if ('error' in target) return { ok: false, error: target.error }
      // A block cannot hold itself: moving one into its own subtree would detach both.
      if (fromPath.every((index, depth) => target.path[depth] === index)) {
        return { ok: false, error: 'InvalidParent' }
      }
      const sourcePath = fromPath.slice(0, -1)
      const fromIndex = fromPath[fromPath.length - 1]!
      // A move within one container lands at an existing index; a move into
      // another can append, so its bound is that container's length.
      const sameContainer = pathKey(sourcePath) === pathKey(target.path)
      const limit = sameContainer ? blocksAt(target.path).length - 1 : blocksAt(target.path).length
      if (operation.to > limit) return { ok: false, error: 'InvalidRange' }
      if (sameContainer && operation.to === fromIndex) continue
      const source = ensureContainer(sourcePath)
      const [moved] = source.splice(fromIndex, 1)
      if (sameContainer) {
        source.splice(operation.to, 0, moved!)
      } else {
        // The removal is folded in and the destination found again before inserting: taking
        // the block out can shift the destination's path, and inserting can shift the
        // source's, so neither copy may be folded against the other's old indices.
        materialize()
        reindex()
        const destination = containerPathOf(operation.parent)
        if ('error' in destination) return { ok: false, error: destination.error }
        ensureContainer(destination.path).splice(operation.to, 0, moved!)
      }
      materialize()
      reindex()
      dirtyNodes.add(operation.node)
      structureChanged = true
      continue
    }
    if (operation.type === 'RetypeBlock') {
      const path = blockPaths.get(operation.node)
      if (path === undefined) return { ok: false, error: 'MissingNode' }
      const target = blockAt(path)
      // Only a text block retypes: a node kind's content is its Kit's contract, and
      // preserved content is never rewritten.
      if (target === undefined || (target.type !== 'Paragraph' && target.type !== 'Heading')) {
        return { ok: false, error: 'InvalidRange' }
      }
      const to = operation.to
      const already =
        to.type === 'Paragraph'
          ? target.type === 'Paragraph'
          : target.type === 'Heading' && target.level === to.level
      if (already) continue
      writeBlock(
        path,
        to.type === 'Paragraph'
          ? { type: 'Paragraph', id: target.id, children: target.children }
          : { type: 'Heading', id: target.id, level: to.level, children: target.children },
      )
      dirtyNodes.add(target.id)
      structureChanged = true
      continue
    }
    if (operation.type === 'InsertNode') {
      materialize()
      const target = containerPathOf(operation.parent)
      if ('error' in target) return { ok: false, error: target.error }
      if (operation.at > blocksAt(target.path).length) return { ok: false, error: 'InvalidRange' }
      const carried = [
        operation.block.id,
        ...operation.block.children.map(run => run.id),
        ...(operation.block.type === 'Node' && operation.block.blocks !== undefined
          ? operation.block.blocks.flatMap(block => [
              block.id,
              ...block.children.map(run => run.id),
            ])
          : []),
      ]
      if (new Set(carried).size !== carried.length || carried.some(id => usedIds.has(id))) {
        return { ok: false, error: 'InvalidInput' }
      }
      const container = ensureContainer(target.path)
      container.splice(operation.at, 0, operation.block)
      materialize()
      for (const id of carried) {
        usedIds.add(id)
        dirtyNodes.add(id)
        insertedNodes.add(id)
      }
      reindex()
      structureChanged = true
      continue
    }
    if (operation.type === 'DeleteNode') {
      materialize()
      const path = blockPaths.get(operation.node)
      if (path === undefined) return { ok: false, error: 'MissingNode' }
      const containerPath = path.slice(0, -1)
      const index = path[path.length - 1]!
      const target = blockAt(path)!
      const container = ensureContainer(containerPath)
      container.splice(index, 1)
      materialize()
      reindex()
      // The nearest surviving run in document order — the first at or after the
      // removed block's place, else the last before it — or nothing, which
      // clears the selection. Walking the tree is what lets a delete beside a
      // container collapse into the container's own runs.
      const removedPlace = { path, index: 0 }
      let fallback: { readonly block: Block; readonly run: Text } | undefined
      let after: { readonly block: Block; readonly run: Text } | undefined
      eachBlock(document.children, (block, blockPath) => {
        for (const [runIndex, run] of block.children.entries()) {
          const place = { path: blockPath, index: runIndex }
          if (compareRunPlaces(place, removedPlace) >= 0) after ??= { block, run }
          else fallback = { block, run }
        }
      })
      const landing = after ?? fallback
      const collapses: Array<CollapseStep> = []
      const removedRuns: Array<NodeId> = []
      const collect = (block: Block): void => {
        for (const run of block.children) removedRuns.push(run.id)
        if (block.type === 'Node' && block.blocks !== undefined) block.blocks.forEach(collect)
      }
      collect(target)
      if (landing !== undefined) {
        for (const run of removedRuns) collapses.push({ node: run, into: landing.run.id })
      }
      if (selection?.type === 'Range') {
        selection =
          landing === undefined
            ? null
            : {
                ...selection,
                anchor: mapPosition(selection.anchor, collapses),
                focus: mapPosition(selection.focus, collapses),
              }
      } else if (selection?.type === 'Node') {
        const selectedNode = selection.node
        if (selectedNode === operation.node || removedRuns.includes(selectedNode)) {
          selection = landing === undefined ? null : { ...selection, node: landing.block.id }
        }
      }
      for (const step of collapses) positionMap.push(step)
      const removedIds: Array<NodeId> = []
      const collectIds = (block: Block): void => {
        removedIds.push(block.id, ...block.children.map(run => run.id))
        if (block.type === 'Node' && block.blocks !== undefined) block.blocks.forEach(collectIds)
      }
      collectIds(target)
      for (const id of removedIds) {
        dirtyNodes.add(id)
        removedNodes.add(id)
      }
      structureChanged = true
      continue
    }
    const id = operation.type === 'InsertText' ? operation.at.node : operation.node
    const location = runPaths.get(id)
    if (location === undefined) return { ok: false, error: 'MissingText' }
    const { path, index: textIndex } = location
    const block = blockAt(path)
    if (block === undefined) return { ok: false, error: 'MissingText' }
    const text = runsAt(path)[textIndex]!
    if (operation.type === 'AddMark') {
      // A run carries a mark name at most once, so adding is a *set*: append
      // when the name is absent, replace when its props differ, and no-op when
      // the mark is already exactly this one (which keeps state identity).
      const existing = text.marks.find(mark => markName(mark) === markName(operation.mark))
      if (existing !== undefined && sameMark(existing, operation.mark)) continue
      const children = runArray(path)
      children[textIndex] = {
        ...text,
        marks:
          existing === undefined
            ? [...text.marks, operation.mark]
            : text.marks.map(mark =>
                markName(mark) === markName(operation.mark) ? operation.mark : mark,
              ),
      }
      dirtyNodes.add(block.id)
      dirtyNodes.add(id)
      textChanged.add(id)
      continue
    }
    if (operation.type === 'RemoveMark') {
      if (!text.marks.some(mark => markName(mark) === operation.mark)) continue
      const children = runArray(path)
      children[textIndex] = {
        ...text,
        marks: text.marks.filter(mark => markName(mark) !== operation.mark),
      }
      dirtyNodes.add(block.id)
      dirtyNodes.add(id)
      textChanged.add(id)
      continue
    }
    const from = operation.type === 'InsertText' ? operation.at.offset : operation.from
    const to = operation.type === 'InsertText' ? from : operation.to
    const inserted = operation.type === 'InsertText' ? operation.text : ''
    if (from > to || to > text.text.length) return { ok: false, error: 'InvalidRange' }
    if (from === to && inserted.length === 0) continue
    const children = runArray(path)
    children[textIndex] = {
      ...text,
      text: text.text.slice(0, from) + inserted + text.text.slice(to),
    }
    const step = { node: id, from, to, inserted: inserted.length }
    positionMap.push(step)
    if (selection?.type === 'Range') {
      selection = {
        ...selection,
        anchor: mapPosition(selection.anchor, [step]),
        focus: mapPosition(selection.focus, [step]),
      }
    }
    dirtyNodes.add(block.id)
    dirtyNodes.add(id)
    textChanged.add(id)
  }
  // The op loop accumulates; the document is assembled once, here.
  materialize()
  // Normalization runs as transforms (§23): each is deterministic and idempotent
  // on normalized state, so the loop settles. The pass bound is a diagnostic,
  // not a hang: a transform that keeps changing the document is refused rather
  // than spinning.
  let pass = 0
  for (; pass < MAX_NORMALIZATION_PASSES; pass++) {
    let changed = false
    for (const transform of transforms) {
      const report = transform.apply(document, { dirtyNodes, pass })
      if (report.document === document) continue
      changed = true
      document = report.document
      for (const id of report.insertedNodes) insertedNodes.add(id)
      for (const id of report.removedNodes) removedNodes.add(id)
      for (const id of report.dirtyNodes) dirtyNodes.add(id)
      for (const id of report.textChanged) textChanged.add(id)
      for (const step of report.steps) positionMap.push(step)
      if (report.structureChanged) structureChanged = true
      if (report.steps.length > 0) selection = mapThrough(selection, report.steps)
      reindex()
    }
    if (!changed) break
  }
  if (pass === MAX_NORMALIZATION_PASSES) return { ok: false, error: 'UnstableNormalization' }
  return {
    ok: true,
    state:
      document === state.document && sameSelection(selection, state.selection)
        ? state
        : { document, selection },
    changeSet: {
      dirtyNodes,
      insertedNodes,
      removedNodes,
      textChanged,
      structureChanged,
      selectionChanged: !sameSelection(selection, state.selection),
    },
    positionMap,
  }
}
