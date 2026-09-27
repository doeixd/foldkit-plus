/**
 * Moving a block beside a sibling: what a block handle's up and down send. The block keeps its
 * identity, its subtree, and the selection inside it.
 */
import { Schema } from 'effect'
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
    ['inside itself', 'l', { before: 'p2' }, 'InvalidParent'],
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

describe('moving a block into another container (§149)', () => {
  const nodes = RichText.nodeRegistry(RichText.standardNodes)
  const item = (name: string, inner: string) => node('ListItem', name, [paragraph(inner)])
  const document = () =>
    RichText.decodeDocument({
      version: 1,
      children: [
        paragraph('a'),
        node('Quote', 'q', [paragraph('qa'), paragraph('qb')]),
        node('List', 'l', [item('i1', 'p1'), item('i2', 'p2')]),
        node('List', 'm', [item('j1', 'r1')]),
        node('Table', 't', [node('TableRow', 'r', [node('TableCell', 'c', [paragraph('cp')])])]),
      ],
    } as never)
  const move = (
    moving: string,
    to: { readonly before: string } | { readonly after: string },
    options: RichText.RunOptions = { nodes },
  ) =>
    RichText.run(
      { document: document(), selection: null },
      {
        type: 'MoveBlock',
        node: id(moving),
        to: 'before' in to ? { before: id(to.before) } : { after: id(to.after) },
      },
      { mint: () => 'unused' },
      options,
    )
  const table = 't[r[c[cp]]]'

  it.each([
    [
      'a paragraph out of a quote',
      'qb',
      { after: 'a' },
      `a qb q[qa] l[i1[p1] i2[p2]] m[j1[r1]] ${table}`,
    ],
    // The list it left is empty, so it goes too.
    [
      'an item into another list',
      'j1',
      { after: 'i2' },
      `a q[qa qb] l[i1[p1] i2[p2] j1[r1]] ${table}`,
    ],
    // Its item is left empty and goes; the list still holds another.
    [
      'an item’s only block out of it',
      'p1',
      { after: 'a' },
      `a p1 q[qa qb] l[i2[p2]] m[j1[r1]] ${table}`,
    ],
    [
      'a paragraph into a table cell',
      'a',
      { before: 'cp' },
      `q[qa qb] l[i1[p1] i2[p2]] m[j1[r1]] t[r[c[a cp]]]`,
    ],
  ] as const)('moves %s', (_, moving, to, expected) => {
    expect(after(move(moving, to))).toBe(expected)
  })

  it.each([
    ['a paragraph into a list', 'a', { before: 'i1' }, 'UnexpectedChild'],
    ['an item to the top level', 'i1', { after: 'a' }, 'UnexpectedChild'],
    ['an item into a quote', 'i1', { after: 'qa' }, 'UnexpectedChild'],
    ['a block out of a table cell', 'cp', { after: 'a' }, 'InvalidParent'],
  ] as const)('refuses %s', (_, moving, to, error) => {
    expect(move(moving, to)).toEqual({ ok: false, error })
  })

  it('stops emptying at the container the block lands in', () => {
    // Without a vocabulary a paragraph may stand in a list: its item empties and goes, and the
    // list that receives it stays.
    expect(after(move('r1', { before: 'j1' }, {}))).toBe(
      `a q[qa qb] l[i1[p1] i2[p2]] m[r1] ${table}`,
    )
  })

  it('moves a node selection on the container it empties onto the block it moved', () => {
    const result = RichText.run(
      { document: document(), selection: { type: 'Node', node: id('m') } },
      { type: 'MoveBlock', node: id('j1'), to: { after: id('i2') } },
      { mint: () => 'unused' },
      { nodes },
    )
    expect(result.ok && result.state.selection).toEqual({ type: 'Node', node: id('j1') })
  })

  it('refuses a place that names both sides when decoding', () => {
    expect(() => Schema.decodeUnknownSync(RichText.Beside)({ before: 'a', after: 'c' })).toThrow()
  })

  it('keeps the selection in the block it moved', () => {
    const caret: RichText.Selection = {
      type: 'Range',
      anchor: { node: id('p1-t'), offset: 1, affinity: 'after' },
      focus: { node: id('p1-t'), offset: 1, affinity: 'after' },
    }
    const result = RichText.run(
      { document: document(), selection: caret },
      { type: 'MoveBlock', node: id('i1'), to: { after: id('j1') } },
      { mint: () => 'unused' },
      { nodes },
    )
    expect(result.ok && result.state.selection).toEqual(caret)
  })

  it.each([
    ['an item: every item of every list', 'i1', ['i1', 'i2', 'j1']],
    ['a cell’s block: only its cell', 'cp', ['cp']],
    [
      'a paragraph: everywhere a paragraph may stand',
      'qb',
      ['a', 'q', 'qa', 'qb', 'l', 'p1', 'p2', 'm', 'r1', 't', 'cp'],
    ],
    ['a quote: anywhere but inside itself', 'q', ['a', 'q', 'l', 'p1', 'p2', 'm', 'r1', 't', 'cp']],
    ['a block that is not there: nowhere', 'x', []],
  ])('offers as targets for %s', (_, moving, expected) => {
    expect(RichText.moveTargets(document(), id(moving), nodes)).toEqual(
      expected.map(name => id(name)),
    )
  })

  it('keeps a cell’s content inside the cell, however deep it sits', () => {
    const cell = () =>
      RichText.decodeDocument({
        version: 1,
        children: [
          paragraph('a'),
          node('Table', 't', [
            node('TableRow', 'r', [
              node('TableCell', 'c', [node('Quote', 'cq', [paragraph('x')]), paragraph('cp')]),
            ]),
          ]),
        ],
      } as never)
    const run = (to: RichText.Beside) =>
      RichText.run(
        { document: cell(), selection: null },
        { type: 'MoveBlock', node: id('x'), to },
        { mint: () => 'unused' },
        { nodes },
      )
    // Out of its quote but still in the cell: the quote empties and goes.
    expect(after(run({ after: id('cp') }))).toBe('a t[r[c[cp x]]]')
    // Out of the cell, from inside the quote in it.
    expect(run({ after: id('a') })).toEqual({ ok: false, error: 'InvalidParent' })
  })
})
