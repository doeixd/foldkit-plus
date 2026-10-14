/**
 * A table edited as a grid: rows and columns beside the caret's cell, Tab and Shift+Tab from
 * cell to cell, and the table gone with its last row or column. Each is one transaction.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const id = RichText.NodeId.make
const cell = (text: string) => ({
  type: 'Node',
  kind: 'TableCell',
  id: `c-${text}`,
  props: {},
  children: [],
  blocks: [
    { type: 'Paragraph', id: `p-${text}`, children: [{ type: 'Text', id: text, text, marks: [] }] },
  ],
})
const row = (name: string, ...texts: ReadonlyArray<string>) => ({
  type: 'Node',
  kind: 'TableRow',
  id: name,
  props: {},
  children: [],
  blocks: texts.map(cell),
})
/** A 2×2 grid, `a b` over `c d`, and a paragraph after it. */
const grid = (...rows: ReadonlyArray<ReturnType<typeof row>>) =>
  RichText.decodeDocument({
    version: 1,
    children: [
      { type: 'Node', kind: 'Table', id: 'table', props: {}, children: [], blocks: rows },
      {
        type: 'Paragraph',
        id: 'after',
        children: [{ type: 'Text', id: 'z', text: 'z', marks: [] }],
      },
    ],
  })
const square = () => grid(row('r1', 'a', 'b'), row('r2', 'c', 'd'))

const caretIn = (run: string, offset = 0): RichText.Selection => ({
  type: 'Range',
  anchor: { node: id(run), offset, affinity: 'after' },
  focus: { node: id(run), offset, affinity: 'after' },
})
const vocabulary = { nodes: RichText.nodeRegistry(RichText.standardNodes) }
const run = (document: RichText.Document, at: string, command: RichText.Command) => {
  let next = 0
  const result = RichText.run(
    { document, selection: caretIn(at) },
    command,
    { mint: () => `n${next++}` },
    vocabulary,
  )
  if (!result.ok) throw new Error(result.error)
  return result.state
}
/** The grid as text, a row a line, an empty cell as `_`. */
const shape = (state: RichText.EditorState): string => {
  const table = state.document.children[0]
  if (table?.type !== 'Node' || table.kind !== 'Table')
    return state.document.children.map(b => b.id).join(' ')
  return (table.blocks ?? [])
    .map(each =>
      (each.type === 'Node' ? (each.blocks ?? []) : [])
        .map(inner => RichText.toText([inner]) || '_')
        .join(' '),
    )
    .join(' / ')
}
/** The text of the cell the caret is in, `_` when empty. */
const caretCell = (state: RichText.EditorState) => {
  const at = RichText.tableAt(state.document, state.selection)!
  const target = at.rows[at.row]!.blocks![at.column]!
  return `${at.row},${at.column}:${RichText.toText([target]) || '_'}`
}

describe('rows and columns', () => {
  it.each([
    ['a row after', 'a', { type: 'InsertRow', where: 'after' }, 'a b / _ _ / c d', '1,0:_'],
    ['a row before', 'd', { type: 'InsertRow', where: 'before' }, 'a b / _ _ / c d', '1,1:_'],
    ['a column after', 'a', { type: 'InsertColumn', where: 'after' }, 'a _ b / c _ d', '0,1:_'],
    ['a column before', 'd', { type: 'InsertColumn', where: 'before' }, 'a _ b / c _ d', '1,1:_'],
    ['the row', 'a', { type: 'DeleteRow' }, 'c d', '0,0:c'],
    ['the column', 'b', { type: 'DeleteColumn' }, 'a / c', '0,0:a'],
  ] as const)('%s', (_, at, command, expected, caret) => {
    const state = run(square(), at, command)
    expect(shape(state)).toBe(expected)
    expect(caretCell(state)).toBe(caret)
  })

  it('makes a new row as wide as the widest, in a ragged table', () => {
    const ragged = grid(row('r1', 'a'), row('r2', 'c', 'd', 'e'))
    expect(shape(run(ragged, 'a', { type: 'InsertRow', where: 'after' }))).toBe('a / _ _ _ / c d e')
  })

  it('puts a new column at the end of a row too short for it', () => {
    const ragged = grid(row('r1', 'a'), row('r2', 'c', 'd', 'e'))
    expect(shape(run(ragged, 'e', { type: 'InsertColumn', where: 'after' }))).toBe('a _ / c d e _')
  })

  it('deletes a row a column empties, and the table with its last row or column', () => {
    const ragged = grid(row('r1', 'a'), row('r2', 'c', 'd'))
    expect(shape(run(ragged, 'a', { type: 'DeleteColumn' }))).toBe('d')
    expect(shape(run(grid(row('r1', 'a', 'b')), 'a', { type: 'DeleteRow' }))).toBe('after')
    expect(shape(run(grid(row('r1', 'a'), row('r2', 'c')), 'a', { type: 'DeleteColumn' }))).toBe(
      'after',
    )
  })

  it('is refused outside a table, and is one undo step inside one', () => {
    const result = RichText.run(
      { document: square(), selection: caretIn('z') },
      { type: 'InsertRow', where: 'after' },
      { mint: () => 'unused' },
    )
    expect(result).toEqual({ ok: false, error: 'InvalidSelection' })
    let next = 0
    const added = RichText.run(
      { document: square(), selection: caretIn('a') },
      { type: 'InsertColumn', where: 'after' },
      { mint: () => `n${next++}` },
    )
    expect(added.ok && added.transactions).toHaveLength(1)
  })
})

describe('Tab and Shift+Tab in a table', () => {
  it.each([
    ['Tab to the next cell in the row', 'a', 'Indent', '0,1:b'],
    ['Tab across to the next row', 'b', 'Indent', '1,0:c'],
    ['Shift+Tab back across rows', 'c', 'Outdent', '0,1:b'],
  ] as const)('%s', (_, at, type, caret) => {
    expect(caretCell(run(square(), at, { type }))).toBe(caret)
  })

  it('Tab in the last cell adds a row and goes to it', () => {
    const state = run(square(), 'd', { type: 'Indent' })
    expect(shape(state)).toBe('a b / c d / _ _')
    expect(caretCell(state)).toBe('2,0:_')
  })

  it('Shift+Tab in the first cell stays', () => {
    const state = run(square(), 'a', { type: 'Outdent' })
    expect(shape(state)).toBe('a b / c d')
    expect(caretCell(state)).toBe('0,0:a')
  })

  it('takes Tab in a table and in code, and nowhere else', () => {
    const doc = square()
    expect(RichText.takesTab(doc, caretIn('a'), vocabulary.nodes)).toBe(true)
    expect(RichText.takesTab(doc, caretIn('z'), vocabulary.nodes)).toBe(false)
  })
})
