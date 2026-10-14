/**
 * Editing a table as a grid: rows and columns added and removed beside the caret's cell, and the
 * caret moved from cell to cell, as Tab and Shift+Tab do. A table is the standard vocabulary's
 * `Table` of `TableRow`s of `TableCell`s, each cell holding blocks; a column is the cells at one
 * index across the rows, which may be ragged, so a column that a short row lacks is skipped
 * rather than refused. Each change is one transaction, so it is one undo step.
 */
import { withFreshIds } from './clipboard.js'
import {
  NodeId,
  blockAtPath,
  eachBlock,
  locateRun,
  rangeStart,
  type Block,
  type Document,
  type EditorState,
  type NodeBlock,
  type Selection,
  type Text,
} from './document.js'
import { Edit, apply, type Operation, type TransactionResult } from './transaction.js'

/** Where a caret stands in a table: the table, its row and the cell's index in that row. */
export interface TableAt {
  readonly table: NodeBlock
  readonly rows: ReadonlyArray<NodeBlock>
  readonly row: number
  readonly column: number
}

const isKind = (block: Block | undefined, kind: string): block is NodeBlock =>
  block?.type === 'Node' && block.kind === kind

/** The cells of a row, which are its nested blocks. */
const cellsOf = (row: NodeBlock): ReadonlyArray<Block> => row.blocks ?? []

/**
 * The table cell the selection starts in, the innermost one when tables nest, or undefined
 * outside a table. A range is read from its start, as the other block commands read it.
 */
export const tableAt = (document: Document, selection: Selection | null): TableAt | undefined => {
  if (selection?.type !== 'Range') return undefined
  const start = rangeStart(document, selection)
  const run = start === undefined ? undefined : locateRun(document, start.node)
  if (run === undefined) return undefined
  // The cell is an ancestor of the caret's text block, its row the cell's parent, and the
  // table the row's: so the cell's path is at least three long.
  for (let depth = run.path.length - 1; depth >= 3; depth--) {
    const cell = blockAtPath(document, run.path.slice(0, depth))
    const row = blockAtPath(document, run.path.slice(0, depth - 1))
    const table = blockAtPath(document, run.path.slice(0, depth - 2))
    if (isKind(cell, 'TableCell') && isKind(row, 'TableRow') && isKind(table, 'Table')) {
      return {
        table,
        rows: (table.blocks ?? []).filter(
          (candidate): candidate is NodeBlock => candidate.type === 'Node',
        ),
        row: run.path[depth - 2]!,
        column: run.path[depth - 1]!,
      }
    }
  }
  return undefined
}

/** An empty cell, under placeholder identities a caller freshens. */
const emptyCell = (): Block => ({
  type: 'Node',
  kind: 'TableCell',
  id: NodeId.make('cell'),
  props: {},
  children: [],
  blocks: [
    {
      type: 'Paragraph',
      id: NodeId.make('paragraph'),
      children: [{ type: 'Text', id: NodeId.make('text'), text: '', marks: [] }],
    },
  ],
})

const fresh = (block: Block, mint: () => string): Block =>
  withFreshIds({ version: 1, blocks: [block] }, mint).blocks[0]!

const firstRun = (block: Block | undefined): Text | undefined => {
  if (block === undefined) return undefined
  let found: Text | undefined
  eachBlock([block], inner => {
    found ??= inner.children[0]
  })
  return found
}

/** The selection at the start of a cell's first text, or the selection as it was. */
const caretIn = (cell: Block | undefined, otherwise: Selection | null): Selection | null => {
  const run = firstRun(cell)
  if (run === undefined) return otherwise
  const at = { node: run.id, offset: 0, affinity: 'after' as const }
  return { type: 'Range', anchor: at, focus: at }
}

/** A table edit, or that the edit would leave the table empty and it should be deleted whole. */
export type TableEdit = TransactionResult | { readonly deleteTable: NodeId }

/** The widest row's cell count: what a new row is given so the grid stays as wide. */
const widthOf = (rows: ReadonlyArray<NodeBlock>): number =>
  Math.max(1, ...rows.map(row => cellsOf(row).length))

/** A row as wide as the table, under fresh identities, and the operation that puts it there. */
const newRow = (at: TableAt, index: number, mint: () => string) => {
  const row = fresh(
    {
      type: 'Node',
      kind: 'TableRow',
      id: NodeId.make('row'),
      props: {},
      children: [],
      blocks: Array.from({ length: widthOf(at.rows) }, emptyCell),
    },
    mint,
  )
  return { row, operation: Edit.insertBlock(row, index, at.table.id) }
}

/** A row above or below the caret's, as wide as the table; the caret goes to it, same column. */
export const insertRow = (
  state: EditorState,
  at: TableAt,
  where: 'before' | 'after',
  mint: () => string,
): TransactionResult => {
  const { row, operation } = newRow(at, at.row + (where === 'after' ? 1 : 0), mint)
  const cells = row.type === 'Node' ? (row.blocks ?? []) : []
  return apply(state, [
    operation,
    Edit.setSelection(caretIn(cells[Math.min(at.column, cells.length - 1)], state.selection)),
  ])
}

/**
 * A cell beside the caret's in every row, before or after it; a row too short to have that
 * column gets its cell at its end. The caret goes to the new cell in its own row.
 */
export const insertColumn = (
  state: EditorState,
  at: TableAt,
  where: 'before' | 'after',
  mint: () => string,
): TransactionResult => {
  const index = at.column + (where === 'after' ? 1 : 0)
  let caretCell: Block | undefined
  const operations: Array<Operation> = at.rows.map((row, rowIndex) => {
    const cell = fresh(emptyCell(), mint)
    if (rowIndex === at.row) caretCell = cell
    return Edit.insertBlock(cell, Math.min(index, cellsOf(row).length), row.id)
  })
  return apply(state, [...operations, Edit.setSelection(caretIn(caretCell, state.selection))])
}

/** The caret's row, gone; the caret goes to the same column of the row after it, or before. */
export const deleteRow = (state: EditorState, at: TableAt): TableEdit => {
  if (at.rows.length === 1) return { deleteTable: at.table.id }
  const next = at.rows[at.row + 1] ?? at.rows[at.row - 1]!
  const cells = cellsOf(next)
  return apply(state, [
    Edit.deleteBlock(at.rows[at.row]!.id),
    Edit.setSelection(caretIn(cells[Math.min(at.column, cells.length - 1)], state.selection)),
  ])
}

/**
 * The caret's column, gone from every row that has it; a row it leaves empty goes too. The
 * caret goes to the cell that takes the column's place in its row, or the one before it.
 */
export const deleteColumn = (state: EditorState, at: TableAt): TableEdit => {
  if (at.rows.every(row => cellsOf(row).length <= 1)) return { deleteTable: at.table.id }
  const operations: Array<Operation> = []
  for (const row of at.rows) {
    const cells = cellsOf(row)
    const cell = cells[at.column]
    if (cell === undefined) continue
    operations.push(Edit.deleteBlock(cells.length === 1 ? row.id : cell.id))
  }
  const own = cellsOf(at.rows[at.row]!)
  const landing = own.length === 1 ? undefined : (own[at.column + 1] ?? own[at.column - 1])
  return apply(state, [
    ...operations,
    ...(landing === undefined ? [] : [Edit.setSelection(caretIn(landing, state.selection))]),
  ])
}

/**
 * The caret to the start of the next cell, across rows, or the previous one: Tab and Shift+Tab.
 * Tab in the last cell adds a row and goes to it; Shift+Tab in the first stays where it is.
 */
export const moveToCell = (
  state: EditorState,
  at: TableAt,
  direction: 'next' | 'previous',
  mint: () => string,
): TransactionResult => {
  const order = at.rows.flatMap((row, rowIndex) =>
    cellsOf(row).map((cell, column) => ({ cell, rowIndex, column })),
  )
  const here = order.findIndex(entry => entry.rowIndex === at.row && entry.column === at.column)
  const target = order[here + (direction === 'next' ? 1 : -1)]
  if (target !== undefined) {
    return apply(state, [Edit.setSelection(caretIn(target.cell, state.selection))])
  }
  if (direction === 'previous') return apply(state, [])
  const { row, operation } = newRow(at, at.rows.length, mint)
  return apply(state, [operation, Edit.setSelection(caretIn(row, state.selection))])
}
