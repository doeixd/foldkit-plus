/**
 * Moving a block beside a sibling: what a block handle's up and down send. The block keeps its
 * identity, its subtree, and the selection inside it.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const id = RichText.NodeId.make
const paragraph = (name: string) => ({
  type: 'Paragraph',
  id: name,
  children: [{ type: 'Text', id: `${name}-t`, text: name, marks: [] }],
})
const node = (kind: string, name: string, blocks: ReadonlyArray<unknown>) => ({
  type: 'Node',
  kind,
  id: name,
  props: {},
  children: [],
  blocks,
})

const document = () =>
  RichText.decodeDocument({
    version: 1,
    children: [
      paragraph('a'),
      paragraph('b'),
      paragraph('c'),
      node('List', 'l', [
        node('ListItem', 'i1', [paragraph('p1')]),
        node('ListItem', 'i2', [paragraph('p2')]),
        node('ListItem', 'i3', [paragraph('p3')]),
      ]),
    ],
  } as never)

const caret: RichText.Selection = {
  type: 'Range',
  anchor: { node: id('a-t'), offset: 1, affinity: 'after' },
  focus: { node: id('a-t'), offset: 1, affinity: 'after' },
}
const ids = { mint: () => 'unused' }
const move = (
  node: string,
  to: { readonly before: string } | { readonly after: string },
  selection: RichText.Selection | null = null,
) =>
  RichText.run(
    { document: document(), selection },
    {
      type: 'MoveBlock',
      node: id(node),
      to: 'before' in to ? { before: id(to.before) } : { after: id(to.after) },
    },
    ids,
  )

const shape = (blocks: ReadonlyArray<RichText.Block>): string =>
  blocks
    .map(block =>
      block.type === 'Node' && block.blocks !== undefined
        ? `${block.id}[${shape(block.blocks)}]`
        : block.id,
    )
    .join(' ')
const after = (result: RichText.TransactionResult) => {
  if (!result.ok) throw new Error(result.error)
  return shape(result.state.document.children)
}

describe('moving a block beside a sibling', () => {
  it.each([
    ['down past a later sibling', 'a', { after: 'c' }, 'b c a l[i1[p1] i2[p2] i3[p3]]'],
    ['down to just before one', 'a', { before: 'c' }, 'b a c l[i1[p1] i2[p2] i3[p3]]'],
    ['up before an earlier one', 'c', { before: 'a' }, 'c a b l[i1[p1] i2[p2] i3[p3]]'],
    ['up to just after one', 'c', { after: 'a' }, 'a c b l[i1[p1] i2[p2] i3[p3]]'],
    ['past a container, whole', 'c', { after: 'l' }, 'a b l[i1[p1] i2[p2] i3[p3]] c'],
    ['a container, with what it holds', 'l', { before: 'a' }, 'l[i1[p1] i2[p2] i3[p3]] a b c'],
    ['within a container', 'i3', { before: 'i1' }, 'a b c l[i3[p3] i1[p1] i2[p2]]'],
    ['beside itself, which is where it is', 'b', { before: 'b' }, 'a b c l[i1[p1] i2[p2] i3[p3]]'],
  ] as const)('%s', (_, node, to, expected) => {
    expect(after(move(node, to))).toBe(expected)
  })

  it('keeps the selection inside the block it moved', () => {
    const result = move('a', { after: 'c' }, caret)
    expect(result.ok && result.state.selection).toEqual(caret)
  })

  it.each([
    ['a sibling in another container', 'a', { before: 'i1' }, 'InvalidParent'],
    ['out of its container', 'i1', { after: 'c' }, 'InvalidParent'],
    ['a block that is not there', 'x', { before: 'a' }, 'InvalidInput'],
    ['beside a block that is not there', 'a', { before: 'x' }, 'InvalidInput'],
  ] as const)('refuses a move to %s', (_, node, to, error) => {
    expect(move(node, to)).toEqual({ ok: false, error })
  })
})

describe('the blocks a selection starts in', () => {
  const at = (run: string) => ({ node: id(run), offset: 0, affinity: 'after' as const })
  const ids = (selection: RichText.Selection | null) =>
    RichText.blocksAt(document(), selection).map(block => block.id)

  it.each<[string, RichText.Selection | null, ReadonlyArray<string>]>([
    ['a caret at the top level', { type: 'Range', anchor: at('b-t'), focus: at('b-t') }, ['b']],
    [
      'a caret in a list item',
      { type: 'Range', anchor: at('p2-t'), focus: at('p2-t') },
      ['l', 'i2', 'p2'],
    ],
    // Dragged backwards, the range still starts at its earlier end.
    ['a backward range', { type: 'Range', anchor: at('p2-t'), focus: at('a-t') }, ['a']],
    ['a node selection', { type: 'Node', node: id('i1') }, ['l', 'i1']],
    ['a selection that resolves to nothing', { type: 'Node', node: id('x') }, []],
    ['no selection', null, []],
  ])('%s', (_, selection, expected) => {
    expect(ids(selection)).toEqual(expected)
  })
})
