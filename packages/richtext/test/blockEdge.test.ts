/**
 * Backspace and Delete at the edge of a block whose neighbour it cannot be joined with: a table,
 * a code block, a quote. An empty line goes and the caret steps into the neighbour; a line with
 * text stays.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const id = RichText.NodeId.make
const paragraph = (block: string, text: string) => ({
  type: 'Paragraph',
  id: block,
  children: [{ type: 'Text', id: `${block}-t`, text, marks: [] }],
})
const node = (kind: string, rest: object) => ({ type: 'Node', kind, id: 'k', props: {}, ...rest })
// Each neighbour, with the run a caret steps into from either side, and that run's length.
const neighbours = [
  ['a quote', node('Quote', { children: [], blocks: [paragraph('in', 'inside')] }), 'in-t', 6],
  [
    'a code block',
    node('CodeBlock', { children: [{ type: 'Text', id: 'code-t', text: 'code', marks: [] }] }),
    'code-t',
    4,
  ],
  [
    'a table',
    node('Table', {
      children: [],
      blocks: [
        node('TableRow', {
          id: 'row',
          children: [],
          blocks: [
            node('TableCell', { id: 'cell', children: [], blocks: [paragraph('c', 'cell')] }),
          ],
        }),
      ],
    }),
    'c-t',
    4,
  ],
] as const
const nodes = RichText.nodeRegistry(RichText.standardNodes)
const caret = (run: string, offset: number): RichText.Selection => {
  const at = { node: id(run), offset, affinity: 'after' as const }
  return { type: 'Range', anchor: at, focus: at }
}
const press = (
  children: ReadonlyArray<unknown>,
  selection: RichText.Selection,
  type: 'DeleteBackward' | 'DeleteForward',
) => {
  const state = { document: RichText.decodeDocument({ version: 1, children }), selection }
  const result = RichText.run(state, { type }, { mint: () => 'unused' }, { nodes })
  if (!result.ok) throw new Error(result.error)
  return { before: state, after: result.state }
}
const ids = (document: RichText.Document) => document.children.map(block => block.id)

describe.each(neighbours)('beside %s', (_, block, run, length) => {
  it('Backspace on an empty line after it removes the line and steps to its end', () => {
    const { after } = press([block, paragraph('x', '')], caret('x-t', 0), 'DeleteBackward')
    expect(ids(after.document)).toEqual(['k'])
    expect(after.selection).toEqual(caret(run, length))
  })

  it('Backspace on a line with text after it steps to its end and changes nothing', () => {
    const { before, after } = press(
      [block, paragraph('x', 'text')],
      caret('x-t', 0),
      'DeleteBackward',
    )
    expect(after.document).toBe(before.document)
    expect(after.selection).toEqual(caret(run, length))
  })

  it('Delete on an empty line before it removes the line and steps to its start', () => {
    const { after } = press([paragraph('x', ''), block], caret('x-t', 0), 'DeleteForward')
    expect(ids(after.document)).toEqual(['k'])
    expect(after.selection).toEqual(caret(run, 0))
  })

  it('Delete at the end of a line with text before it leaves both as they are', () => {
    const { before, after } = press(
      [paragraph('x', 'text'), block],
      caret('x-t', 4),
      'DeleteForward',
    )
    expect(after).toBe(before)
  })
})
