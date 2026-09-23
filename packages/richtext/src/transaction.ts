import { Schema } from 'effect'
import {
  EditorState,
  Mark,
  NodeId,
  Position,
  Selection,
  selectionIsValid,
  type Document,
  type NodeReference,
} from './document.js'

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

export const Operation = Schema.Union([
  InsertTextOperation,
  DeleteTextOperation,
  AddMarkOperation,
  RemoveMarkOperation,
  SetSelectionOperation,
  SplitNodeOperation,
  JoinNodeOperation,
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

/** Maps a position through each edit, preserving insertion affinity. */
export const mapPosition = (
  position: Position,
  steps: ReadonlyArray<PositionStep | SplitStep | RelocateStep>,
): Position =>
  steps.reduce((current, step) => {
    if (current.node !== step.node) return current
    if ('base' in step) {
      if (current.offset < step.at) return current
      return { ...current, node: step.into, offset: step.base + current.offset - step.at }
    }
    if ('into' in step) {
      if (current.offset < step.at) return current
      if (current.offset === step.at && current.affinity === 'before') return current
      return { ...current, node: step.into, offset: current.offset - step.at }
    }
    if (current.offset < step.from) return current
    const offset =
      current.offset > step.to
        ? current.offset + step.inserted - (step.to - step.from)
        : step.from + (current.affinity === 'after' ? step.inserted : 0)
    return offset === current.offset ? current : { ...current, offset }
  }, position)

export type TransactionResult =
  | {
      readonly ok: true
      readonly state: EditorState
      readonly changeSet: ChangeSet
      readonly positionMap: ReadonlyArray<PositionStep | SplitStep | RelocateStep>
    }
  | {
      readonly ok: false
      readonly error:
        'InvalidInput' | 'MissingText' | 'MissingNode' | 'InvalidRange' | 'InvalidSelection'
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

/** Pure, atomic text transaction. Rejection returns no partially edited state. */
export const apply = (state: EditorState, transaction: Transaction): TransactionResult => {
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
  let selection = state.selection
  const dirtyNodes = new Set<NodeId>()
  const insertedNodes = new Set<NodeId>()
  const removedNodes = new Set<NodeId>()
  const textChanged = new Set<NodeId>()
  let structureChanged = false
  const positionMap: Array<PositionStep | SplitStep | RelocateStep> = []
  for (const operation of transaction) {
    if (operation.type === 'SetSelection') {
      if (!selectionIsValid(document, operation.selection)) {
        return { ok: false, error: 'InvalidSelection' }
      }
      selection = operation.selection
      continue
    }
    if (operation.type === 'SplitNode') {
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
    const id = operation.type === 'InsertText' ? operation.at.node : operation.node
    const location = locations.get(id)
    if (location === undefined) return { ok: false, error: 'MissingText' }
    const [blockIndex, textIndex] = location
    const block = document.children[blockIndex]!
    const text = block.children[textIndex]!
    if (operation.type === 'AddMark' || operation.type === 'RemoveMark') {
      const has = text.marks.includes(operation.mark)
      if (operation.type === 'AddMark' ? has : !has) continue
      const children = [...block.children]
      children[textIndex] = {
        ...text,
        marks:
          operation.type === 'AddMark'
            ? [...text.marks, operation.mark]
            : text.marks.filter(mark => mark !== operation.mark),
      }
      const blocks = [...document.children]
      blocks[blockIndex] = { ...block, children }
      document = { ...document, children: blocks }
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
    const children = [...block.children]
    children[textIndex] = {
      ...text,
      text: text.text.slice(0, from) + inserted + text.text.slice(to),
    }
    const blocks = [...document.children]
    blocks[blockIndex] = { ...block, children }
    document = { ...document, children: blocks }
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
