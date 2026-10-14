/**
 * Tab and Shift+Tab in a list: an item nests under the one before it, and comes back out, keeping
 * its identity and the caret.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const id = RichText.NodeId.make
const item = (name: string, nested: ReadonlyArray<unknown> = []) => ({
  type: 'Node',
  kind: 'ListItem',
  id: name,
  props: {},
  children: [],
  blocks: [
    {
      type: 'Paragraph',
      id: `p-${name}`,
      children: [{ type: 'Text', id: name.toUpperCase(), text: name, marks: [] }],
    },
    ...nested,
  ],
})
const list = (name: string, items: ReadonlyArray<unknown>, props: object = {}) => ({
  type: 'Node',
  kind: 'List',
  id: name,
  props,
  children: [],
  blocks: items,
})
const doc = (...children: ReadonlyArray<unknown>) =>
  RichText.decodeDocument({ version: 1, children })
const caretIn = (run: string): RichText.Selection => ({
  type: 'Range',
  anchor: { node: id(run), offset: 1, affinity: 'after' },
  focus: { node: id(run), offset: 1, affinity: 'after' },
})
const nodes = RichText.nodeRegistry(RichText.standardNodes)
const run = (document: RichText.Document, at: string, type: 'Indent' | 'Outdent') => {
  let next = 0
  const result = RichText.run(
    { document, selection: caretIn(at) },
    { type },
    { mint: () => `n${next++}` },
    { nodes },
  )
  if (!result.ok) throw new Error(result.error)
  return result.state
}
/** The lists and items as text: `list[a[list[b]]]`, paragraphs left out. */
const shape = (blocks: ReadonlyArray<RichText.Block>): string =>
  blocks.flatMap(block => (block.type === 'Node' ? [described(block)] : [])).join(' ')
const described = (block: RichText.NodeBlock): string => {
  const inner = shape(block.blocks ?? [])
  if (block.kind === 'List') return `list[${inner}]`
  return inner === '' ? block.id : `${block.id}[${inner}]`
}

describe('Tab in a list', () => {
  it('nests an item under the one before it, in a new list like its own', () => {
    const state = run(doc(list('l', [item('a'), item('b')], { ordered: true })), 'B', 'Indent')
    expect(shape(state.document.children)).toBe('list[a[list[b]]]')
    // The list, its first item, and the item's second block: the new list.
    expect(RichText.blockAtPath(state.document, [0, 0, 1])).toMatchObject({
      kind: 'List',
      props: { ordered: true },
    })
    expect(state.selection).toEqual(caretIn('B'))
  })

  it('joins the list the item before it already ends with', () => {
    const state = run(
      doc(list('l', [item('a', [list('n', [item('x')])]), item('b')])),
      'B',
      'Indent',
    )
    expect(shape(state.document.children)).toBe('list[a[list[x b]]]')
  })

  it('makes a list of its own kind when the one there is another kind', () => {
    const before = doc(
      list('l', [item('a', [list('n', [item('x')], { ordered: true })]), item('b')]),
    )
    expect(shape(run(before, 'B', 'Indent').document.children)).toBe('list[a[list[x] list[b]]]')
  })

  it('leaves the first item where it is', () => {
    const before = doc(list('l', [item('a'), item('b')]))
    expect(run(before, 'A', 'Indent').document).toBe(before)
  })
})

describe('Shift+Tab in a list', () => {
  it('moves a nested item out to follow the item it was under, taking an emptied list away', () => {
    const state = run(doc(list('l', [item('a', [list('n', [item('b')])])])), 'B', 'Outdent')
    expect(shape(state.document.children)).toBe('list[a b]')
    expect(state.selection).toEqual(caretIn('B'))
  })

  it('takes an item at the top level out of its list', () => {
    const state = run(doc(list('l', [item('a'), item('b')])), 'B', 'Outdent')
    expect(state.document.children.map(block => block.type)).toEqual(['Node', 'Paragraph'])
  })
})

it('takes Tab in a list', () => {
  const document = doc(list('l', [item('a')]))
  expect(RichText.takesTab(document, caretIn('A'), nodes)).toBe(true)
})
