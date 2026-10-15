/**
 * Backspace and Delete at the edge of a block whose neighbour it cannot be joined with: a table,
 * a code block, a quote. An empty line goes and the caret steps into the neighbour. A line with
 * text joins the nearest line inside a quote, and beside a table or code stays.
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

  it('Delete on an empty line before it removes the line and steps to its start', () => {
    const { after } = press([paragraph('x', ''), block], caret('x-t', 0), 'DeleteForward')
    expect(ids(after.document)).toEqual(['k'])
    expect(after.selection).toEqual(caret(run, 0))
  })
})

describe.each(neighbours.slice(1))('with text beside %s', (_, block, run, length) => {
  it('Backspace on a line with text after it steps to its end and changes nothing', () => {
    const { before, after } = press(
      [block, paragraph('x', 'text')],
      caret('x-t', 0),
      'DeleteBackward',
    )
    expect(after.document).toBe(before.document)
    expect(after.selection).toEqual(caret(run, length))
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

describe('with text beside a quote', () => {
  const quote = neighbours[0][1]

  it('Backspace joins the line to the quote’s last line', () => {
    const { after } = press([quote, paragraph('x', 'text')], caret('x-t', 0), 'DeleteBackward')
    expect(after.document.children.map(block => RichText.toText([block]))).toEqual(['insidetext'])
    expect(after.selection).toEqual(caret('in-t', 6))
  })

  it('Delete joins the quote’s first line to the line', () => {
    const { after } = press([paragraph('x', 'text'), quote], caret('x-t', 4), 'DeleteForward')
    expect(after.document.children.map(block => RichText.toText([block]))).toEqual(['textinside'])
    expect(after.selection).toEqual(caret('x-t', 4))
  })
})

it('reaches past the end of a list item into the next one', () => {
  const item = (block: string, text: string) =>
    node('ListItem', { id: `${block}-item`, children: [], blocks: [paragraph(block, text)] })
  const list = node('List', { children: [], blocks: [item('one', 'One'), item('two', 'Two')] })
  const { after } = press([list], caret('one-t', 3), 'DeleteForward')
  const [joined] = after.document.children
  expect(joined?.type === 'Node' ? joined.blocks?.map(block => block.id) : []).toEqual(['one-item'])
  expect(RichText.toText(after.document.children)).toBe('OneTwo')
})

it('selects an image it reaches past the end of a list, rather than deleting it', () => {
  const item = node('ListItem', { id: 'item', children: [], blocks: [paragraph('one', 'One')] })
  const list = node('List', { children: [], blocks: [item] })
  const image = { type: 'Node', kind: 'Image', id: 'image', props: { src: 'x.png' }, children: [] }
  const { before, after } = press([list, image], caret('one-t', 3), 'DeleteForward')
  expect(after.document).toBe(before.document)
  expect(after.selection).toEqual({ type: 'Node', node: 'image' })
})
