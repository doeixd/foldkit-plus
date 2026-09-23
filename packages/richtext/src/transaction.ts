import { Schema } from 'effect'
import { resolveInsertion } from './marks.js'
import {
  Block,
  EditorState,
  Mark,
  NodeId,
  Position,
  Selection,
  selectionIsValid,
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
  mark: Mark,
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
})
const SetNodePropsOperation = Schema.Struct({
  type: Schema.Literal('SetNodeProps'),
  node: NodeId,
  level: Schema.Literals([1, 2, 3, 4, 5, 6]),
})
const InsertNodeOperation = Schema.Struct({
  type: Schema.Literal('InsertNode'),
  block: Block,
  at: Offset,
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
  SetNodePropsOperation,
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

  addMark: (node: TextTarget, mark: Mark): Extract<Operation, { readonly type: 'AddMark' }> =>
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

  moveBlock: (node: TextTarget, to: number): Extract<Operation, { readonly type: 'MoveNode' }> =>
    MoveNodeOperation.make({ type: 'MoveNode', node: targetId(node), to }),

  setNodeProps: (
    node: TextTarget,
    level: 1 | 2 | 3 | 4 | 5 | 6,
  ): Extract<Operation, { readonly type: 'SetNodeProps' }> =>
    SetNodePropsOperation.make({ type: 'SetNodeProps', node: targetId(node), level }),

  insertBlock: (block: Block, at: number): Extract<Operation, { readonly type: 'InsertNode' }> =>
    InsertNodeOperation.make({ type: 'InsertNode', block, at }),

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
    const runLocations = new Map<NodeId, readonly [number, number]>()
    const blockIndexes = new Map<NodeId, number>()
    current.children.forEach((block, blockIndex) => {
      blockIndexes.set(block.id, blockIndex)
      block.children.forEach((text, textIndex) =>
        runLocations.set(text.id, [blockIndex, textIndex]),
      )
    })
    return { runLocations, blockIndexes }
  }
  let { runLocations: locations, blockIndexes } = indexDocument(state.document)
  const reindex = () => {
    ;({ runLocations: locations, blockIndexes } = indexDocument(document))
  }
  // Identities stay reserved for the whole transaction so a reused id can
  // never silently address two nodes across structural edits.
  const usedIds = new Set<NodeId>([...locations.keys(), ...blockIndexes.keys()])
  let document: Document = state.document
  // Working copies: a block's run array is copied once per transaction, however
  // many operations touch it, so N edits in one paragraph cost O(N) rather than
  // N copies of the same array. Structural operations materialize first, since
  // they rebuild the block list itself.
  let workingBlocks: Array<Block> | undefined
  const workingRuns = new Map<number, Array<Text>>()
  const materialize = (): void => {
    if (workingBlocks === undefined && workingRuns.size === 0) return
    const next = workingBlocks ?? [...document.children]
    for (const [index, children] of workingRuns) next[index] = { ...next[index]!, children }
    workingRuns.clear()
    workingBlocks = undefined
    document = { ...document, children: next }
  }
  const blockAt = (index: number): Block => workingBlocks?.[index] ?? document.children[index]!
  /** The block's runs as they stand: a pending copy if one exists, else the document's. */
  const runsAt = (index: number): ReadonlyArray<Text> =>
    workingRuns.get(index) ?? document.children[index]!.children
  /** The block's run array, copied on first write and mutated in place after. */
  const runArray = (index: number): Array<Text> => {
    const existing = workingRuns.get(index)
    if (existing !== undefined) return existing
    const copy = [...document.children[index]!.children]
    workingRuns.set(index, copy)
    return copy
  }
  const writeBlock = (index: number, block: Block): void => {
    workingBlocks ??= [...document.children]
    workingBlocks[index] = block
  }
  let selection = state.selection
  const dirtyNodes = new Set<NodeId>()
  const insertedNodes = new Set<NodeId>()
  const removedNodes = new Set<NodeId>()
  const textChanged = new Set<NodeId>()
  let structureChanged = false
  const positionMap: Array<PositionStep | SplitStep | RelocateStep | CollapseStep> = []
  for (const operation of transaction) {
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
      const location = locations.get(operation.node)
      if (location === undefined) return { ok: false, error: 'MissingText' }
      const [blockIndex, textIndex] = location
      const target = blockAt(blockIndex)
      const run = runsAt(blockIndex)[textIndex]!
      if (operation.offset > run.text.length) return { ok: false, error: 'InvalidRange' }
      if (usedIds.has(operation.textId)) return { ok: false, error: 'InvalidInput' }
      if (operation.offset === 0) {
        // No left remainder: the new run would be an empty duplicate. Splitting
        // at 0 is the caller's no-op, not a silent identity change.
        continue
      }
      const children = runArray(blockIndex)
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
      const blockIndex = blockIndexes.get(operation.block)
      if (blockIndex === undefined) return { ok: false, error: 'MissingNode' }
      const runLocation = locations.get(operation.node)
      if (runLocation === undefined) return { ok: false, error: 'MissingText' }
      const [runBlockIndex, textIndex] = runLocation
      if (runBlockIndex !== blockIndex) return { ok: false, error: 'InvalidRange' }
      const target = document.children[blockIndex]!
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
      const blocks = [...document.children]
      blocks[blockIndex] = leftBlock
      blocks.splice(blockIndex + 1, 0, rightBlock)
      document = { ...document, children: blocks }
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
      const intoIndex = blockIndexes.get(operation.into)
      if (intoIndex === undefined) return { ok: false, error: 'MissingNode' }
      const removedIndex = blockIndexes.get(operation.removed)
      if (removedIndex === undefined) return { ok: false, error: 'MissingNode' }
      if (removedIndex !== intoIndex + 1) return { ok: false, error: 'InvalidRange' }
      const survivor = document.children[intoIndex]!
      const removed = document.children[removedIndex]!
      const blocks = [...document.children]
      blocks[intoIndex] = { ...survivor, children: [...survivor.children, ...removed.children] }
      blocks.splice(removedIndex, 1)
      document = { ...document, children: blocks }
      reindex()
      if (selection?.type === 'Node' && selection.node === operation.removed) {
        selection = { ...selection, node: operation.into }
      }
      dirtyNodes.add(operation.into)
      dirtyNodes.add(operation.removed)
      for (const moved of removed.children) dirtyNodes.add(moved.id)
      removedNodes.add(operation.removed)
      structureChanged = true
      continue
    }
    if (operation.type === 'MoveNode') {
      materialize()
      const fromIndex = blockIndexes.get(operation.node)
      if (fromIndex === undefined) return { ok: false, error: 'MissingNode' }
      if (operation.to > document.children.length - 1) return { ok: false, error: 'InvalidRange' }
      if (operation.to === fromIndex) continue
      const blocks = [...document.children]
      const [moved] = blocks.splice(fromIndex, 1)
      blocks.splice(operation.to, 0, moved!)
      document = { ...document, children: blocks }
      reindex()
      dirtyNodes.add(operation.node)
      structureChanged = true
      continue
    }
    if (operation.type === 'SetNodeProps') {
      const blockIndex = blockIndexes.get(operation.node)
      if (blockIndex === undefined) return { ok: false, error: 'MissingNode' }
      const target = blockAt(blockIndex)
      if (target.type !== 'Heading') return { ok: false, error: 'InvalidRange' }
      if (target.level === operation.level) continue
      writeBlock(blockIndex, { ...target, level: operation.level })
      dirtyNodes.add(target.id)
      structureChanged = true
      continue
    }
    if (operation.type === 'InsertNode') {
      materialize()
      if (operation.at > document.children.length) return { ok: false, error: 'InvalidRange' }
      const carried = [operation.block.id, ...operation.block.children.map(run => run.id)]
      if (new Set(carried).size !== carried.length || carried.some(id => usedIds.has(id))) {
        return { ok: false, error: 'InvalidInput' }
      }
      const blocks = [...document.children]
      blocks.splice(operation.at, 0, operation.block)
      document = { ...document, children: blocks }
      for (const id of carried) usedIds.add(id)
      reindex()
      dirtyNodes.add(operation.block.id)
      insertedNodes.add(operation.block.id)
      for (const run of operation.block.children) {
        dirtyNodes.add(run.id)
        insertedNodes.add(run.id)
      }
      structureChanged = true
      continue
    }
    if (operation.type === 'DeleteNode') {
      materialize()
      const blockIndex = blockIndexes.get(operation.node)
      if (blockIndex === undefined) return { ok: false, error: 'MissingNode' }
      const target = document.children[blockIndex]!
      const blocks = [...document.children]
      blocks.splice(blockIndex, 1)
      // Collapse to the start of the block now at this index, wrapping to the
      // document start; with no runs left anywhere, selection clears instead.
      const ordered = [...blocks.slice(blockIndex), ...blocks.slice(0, blockIndex)]
      const fallbackBlock = ordered.find(block => block.children[0] !== undefined)
      const fallback = fallbackBlock?.children[0]
      const collapses: Array<CollapseStep> = []
      if (fallback !== undefined) {
        for (const run of target.children) collapses.push({ node: run.id, into: fallback.id })
      }
      document = { ...document, children: blocks }
      reindex()
      if (selection?.type === 'Range') {
        selection =
          fallback === undefined
            ? null
            : {
                ...selection,
                anchor: mapPosition(selection.anchor, collapses),
                focus: mapPosition(selection.focus, collapses),
              }
      } else if (selection?.type === 'Node') {
        const selectedNode = selection.node
        if (
          selectedNode === operation.node ||
          target.children.some(run => run.id === selectedNode)
        ) {
          selection = fallbackBlock === undefined ? null : { ...selection, node: fallbackBlock.id }
        }
      }
      for (const step of collapses) positionMap.push(step)
      dirtyNodes.add(operation.node)
      removedNodes.add(operation.node)
      for (const run of target.children) {
        dirtyNodes.add(run.id)
        removedNodes.add(run.id)
      }
      structureChanged = true
      continue
    }
    const id = operation.type === 'InsertText' ? operation.at.node : operation.node
    const location = locations.get(id)
    if (location === undefined) return { ok: false, error: 'MissingText' }
    const [blockIndex, textIndex] = location
    const block = blockAt(blockIndex)
    const text = runsAt(blockIndex)[textIndex]!
    if (operation.type === 'AddMark' || operation.type === 'RemoveMark') {
      const has = text.marks.includes(operation.mark)
      if (operation.type === 'AddMark' ? has : !has) continue
      const children = runArray(blockIndex)
      children[textIndex] = {
        ...text,
        marks:
          operation.type === 'AddMark'
            ? [...text.marks, operation.mark]
            : text.marks.filter(mark => mark !== operation.mark),
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
    const children = runArray(blockIndex)
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
