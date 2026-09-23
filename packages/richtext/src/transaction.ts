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
  mark: Mark,
})
const SetSelectionOperation = Schema.Struct({
  type: Schema.Literal('SetSelection'),
  selection: Schema.NullOr(Selection),
})

export const Operation = Schema.Union([
  InsertTextOperation,
  DeleteTextOperation,
  AddMarkOperation,
  RemoveMarkOperation,
  SetSelectionOperation,
])
export type Operation = typeof Operation.Type
export const Transaction = Schema.Array(Operation)
export type Transaction = typeof Transaction.Type

/** A text-run target: a validated id or a reusable node reference. */
export type TextTarget = NodeId | NodeReference

const targetId = (target: TextTarget): NodeId => (typeof target === 'string' ? target : target.id)

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

  removeMark: (node: TextTarget, mark: Mark): Extract<Operation, { readonly type: 'RemoveMark' }> =>
    RemoveMarkOperation.make({ type: 'RemoveMark', node: targetId(node), mark }),

  setSelection: (
    selection: Selection | null,
  ): Extract<Operation, { readonly type: 'SetSelection' }> =>
    SetSelectionOperation.make({ type: 'SetSelection', selection }),
}

export interface ChangeSet {
  readonly dirtyNodes: ReadonlySet<NodeId>
  readonly textChanged: ReadonlySet<NodeId>
  readonly selectionChanged: boolean
}

/** One replacement of [from, to) with inserted UTF-16 units, in sequential coordinates. */
export interface PositionStep {
  readonly node: NodeId
  readonly from: number
  readonly to: number
  readonly inserted: number
}

/** Maps a position through each edit, preserving insertion affinity. */
export const mapPosition = (position: Position, steps: ReadonlyArray<PositionStep>): Position =>
  steps.reduce((current, step) => {
    if (current.node !== step.node || current.offset < step.from) return current
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
      readonly positionMap: ReadonlyArray<PositionStep>
    }
  | {
      readonly ok: false
      readonly error: 'InvalidInput' | 'MissingText' | 'InvalidRange' | 'InvalidSelection'
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
  const locations = new Map<NodeId, readonly [number, number]>()
  state.document.children.forEach((block, blockIndex) =>
    block.children.forEach((text, textIndex) => locations.set(text.id, [blockIndex, textIndex])),
  )
  let document: Document = state.document
  let selection = state.selection
  const dirtyNodes = new Set<NodeId>()
  const textChanged = new Set<NodeId>()
  const positionMap: Array<PositionStep> = []
  for (const operation of transaction) {
    if (operation.type === 'SetSelection') {
      if (!selectionIsValid(document, operation.selection)) {
        return { ok: false, error: 'InvalidSelection' }
      }
      selection = operation.selection
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
      textChanged,
      selectionChanged: !sameSelection(selection, state.selection),
    },
    positionMap,
  }
}
