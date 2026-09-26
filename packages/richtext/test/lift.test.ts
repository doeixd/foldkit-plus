/**
 * Lifting a block out of its container (§131's open question, now built): the inverse of a
 * wrap, and what Backspace does at the start of a quote's or a list item's first block.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const id = RichText.NodeId.make
const paragraph = (name: string, text: string) => ({
  type: 'Paragraph',
  id: name,
  children: [{ type: 'Text', id: `${name}-t`, text, marks: [] }],
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
      paragraph('top', 'top'),
      node('Quote', 'q', [paragraph('p1', 'a'), paragraph('p2', 'b'), paragraph('p3', 'c')]),
      node('List', 'l', [
        node('ListItem', 'i1', [paragraph('pi1', 'one')]),
        node('ListItem', 'i2', [paragraph('pi2', 'two')]),
        node('ListItem', 'i3', [paragraph('pi3', 'three')]),
      ]),
      node('Table', 't', [node('TableRow', 'r', [node('TableCell', 'c', [paragraph('pc', 'x')])])]),
      node('Quote', 'solo', [paragraph('ps', 'alone')]),
    ],
  } as never)

const caret = (run: string, offset = 0): RichText.Selection => ({
  type: 'Range',
  anchor: { node: id(run), offset, affinity: 'after' },
  focus: { node: id(run), offset, affinity: 'after' },
})
const ids = () => {
  let n = 0
  return { mint: () => `new-${++n}` }
}
const standard = RichText.nodeRegistry(RichText.standardNodes)
const run = (
  selection: RichText.Selection,
  command: RichText.Command,
  options: RichText.RunOptions = {},
) => RichText.run({ document: document(), selection }, command, ids(), options)

/** The document's shape as `kind(id)[children]`, which is what a lift changes. */
const shape = (blocks: ReadonlyArray<RichText.Block>): ReadonlyArray<string> =>
  blocks.map(block =>
    block.type === 'Node' && block.blocks !== undefined
      ? `${block.kind}(${block.id})[${shape(block.blocks).join(', ')}]`
      : `${block.type === 'Node' ? block.kind : block.type}(${block.id})`,
  )
const after = (result: RichText.TransactionResult) => {
  if (!result.ok) throw new Error(result.error)
  return shape(result.state.document.children)
}

describe('lifting a block out of its container', () => {
  it.each([
    [
      'the first block before the container',
      'p1-t',
      ['Paragraph(p1)', 'Quote(q)[Paragraph(p2), Paragraph(p3)]'],
    ],
    [
      'the last block after it',
      'p3-t',
      ['Quote(q)[Paragraph(p1), Paragraph(p2)]', 'Paragraph(p3)'],
    ],
    [
      'a middle block between the halves of a split container',
      'p2-t',
      ['Quote(q)[Paragraph(p1)]', 'Paragraph(p2)', 'Quote(new-1)[Paragraph(p3)]'],
    ],
  ])('moves %s', (_, at, expected) => {
    // The whole document: a stray container left anywhere by the lift must show up.
    const untouched = shape(document().children)
    expect(after(run(caret(at), { type: 'LiftBlock' }))).toEqual([
      untouched[0],
      ...expected,
      ...untouched.slice(2),
    ])
  })

  it('deletes a container the lift leaves empty', () => {
    expect(after(run(caret('ps-t'), { type: 'LiftBlock' })).at(-1)).toBe('Paragraph(ps)')
  })

  it('leaves the list too when the vocabulary says a list holds only items', () => {
    expect(
      after(run(caret('pi2-t'), { type: 'LiftBlock' }, { nodes: standard })).slice(2, 5),
    ).toEqual([
      'List(l)[ListItem(i1)[Paragraph(pi1)]]',
      'Paragraph(pi2)',
      'List(new-1)[ListItem(i3)[Paragraph(pi3)]]',
    ])
    // Without a vocabulary nothing says so, and one step leaves it in the list.
    expect(after(run(caret('pi2-t'), { type: 'LiftBlock' }))[2]).toBe(
      'List(l)[ListItem(i1)[Paragraph(pi1)], Paragraph(pi2), ListItem(i3)[Paragraph(pi3)]]',
    )
  })

  it('never leaves a container the vocabulary declares isolating, nor the top level', () => {
    for (const at of ['pc-t', 'top-t']) {
      expect(run(caret(at), { type: 'LiftBlock' }, { nodes: standard })).toMatchObject({
        ok: false,
        error: 'InvalidInput',
      })
    }
  })

  it('keeps the block and the caret on it', () => {
    const result = run(caret('pi1-t', 2), { type: 'LiftBlock' }, { nodes: standard })
    if (!result.ok) throw new Error(result.error)
    expect(result.state.selection).toEqual(caret('pi1-t', 2))
    expect(shape(result.state.document.children).slice(2, 4)).toEqual([
      'Paragraph(pi1)',
      'List(l)[ListItem(i2)[Paragraph(pi2)], ListItem(i3)[Paragraph(pi3)]]',
    ])
  })
})

describe('Backspace at the start of a container’s first block', () => {
  it('lifts the block out when there is a vocabulary', () => {
    expect(after(run(caret('pi1-t'), { type: 'DeleteBackward' }, { nodes: standard }))[2]).toBe(
      'Paragraph(pi1)',
    )
  })

  it('still joins a block that has a sibling before it', () => {
    const result = run(caret('p2-t'), { type: 'DeleteBackward' }, { nodes: standard })
    if (!result.ok) throw new Error(result.error)
    expect(shape(result.state.document.children)[1]).toBe('Quote(q)[Paragraph(p1), Paragraph(p3)]')
  })

  it('does nothing without a vocabulary, in a table cell, or forwards', () => {
    for (const [at, command, options] of [
      ['pi1-t', 'DeleteBackward', {}],
      ['pc-t', 'DeleteBackward', { nodes: standard }],
      ['p3-t', 'DeleteForward', { nodes: standard }],
    ] as const) {
      const offset = command === 'DeleteForward' ? 1 : 0
      const result = run(caret(at, offset), { type: command }, options)
      if (!result.ok) throw new Error(result.error)
      expect(result.state.document).toEqual(document())
    }
  })
})

describe('Enter inside a list item', () => {
  const listed = () =>
    RichText.decodeDocument({
      version: 1,
      children: [
        node('List', 'l', [
          node('ListItem', 'i1', [paragraph('p1', 'one')]),
          node('ListItem', 'i2', [paragraph('p2', 'two'), paragraph('p2b', 'more')]),
          node('ListItem', 'i3', [paragraph('pe', '')]),
          node('ListItem', 'i4', [paragraph('pe2', ''), paragraph('px', 'x')]),
          node('ListItem', 'i5', [node('Quote', 'iq', [paragraph('pn', 'nested')])]),
        ]),
        node('Quote', 'q', [paragraph('pq', 'quoted')]),
        node('Table', 't', [
          node('TableRow', 'r', [node('TableCell', 'c', [paragraph('pc', 'cell')])]),
        ]),
      ],
    } as never)
  const enter = (at: string, offset: number, options: RichText.RunOptions = { nodes: standard }) =>
    RichText.run(
      { document: listed(), selection: caret(at, offset) },
      { type: 'SplitBlock' },
      ids(),
      options,
    )
  /** The items after `i2`, which the tests below leave alone. */
  const rest = [{ i3: [''] }, { i4: ['', 'x'] }, { i5: [{ iq: ['nested'] }] }]
  const texts = (blocks: ReadonlyArray<RichText.Block>): ReadonlyArray<unknown> =>
    blocks.map(block =>
      block.type === 'Node' && block.blocks !== undefined
        ? { [block.id]: texts(block.blocks) }
        : block.children.map(run => run.text).join(''),
    )

  it('starts a new item holding the rest of the text, with the caret at its start', () => {
    const result = enter('p1-t', 1)
    if (!result.ok) throw new Error(result.error)
    expect(texts(result.state.document.children)[0]).toEqual({
      l: [{ i1: ['o'] }, { 'new-3': ['ne'] }, { i2: ['two', 'more'] }, ...rest],
    })
    expect(result.state.selection).toEqual(caret('new-1'))
  })

  it('carries the blocks after the caret’s block into the new item', () => {
    const result = enter('p2-t', 3)
    if (!result.ok) throw new Error(result.error)
    expect(texts(result.state.document.children)[0]).toEqual({
      l: [{ i1: ['one'] }, { i2: ['two'] }, { 'new-3': ['', 'more'] }, ...rest],
    })
  })

  it('leaves the list from an empty item', () => {
    const result = enter('pe-t', 0)
    if (!result.ok) throw new Error(result.error)
    expect(texts(result.state.document.children).slice(0, 3)).toEqual([
      { l: [{ i1: ['one'] }, { i2: ['two', 'more'] }] },
      '',
      { 'new-1': [{ i4: ['', 'x'] }, { i5: [{ iq: ['nested'] }] }] },
    ])
    expect(result.state.selection).toEqual(caret('pe-t'))
  })

  it('splits an empty block that is not the item’s whole content', () => {
    const result = enter('pe2-t', 0)
    if (!result.ok) throw new Error(result.error)
    expect(texts(result.state.document.children)[0]).toMatchObject({
      l: [{}, {}, {}, { i4: [''] }, { 'new-3': ['', 'x'] }, {}],
    })
  })

  it('splits only the block inside a quote nested in an item, the quote being no item', () => {
    const result = enter('pn-t', 2)
    if (!result.ok) throw new Error(result.error)
    expect(texts(result.state.document.children)[0]).toMatchObject({
      l: [{}, {}, {}, {}, { i5: [{ iq: ['ne', 'sted'] }] }],
    })
  })

  it('deletes a range inside an item and then splits the item', () => {
    const result = RichText.run(
      {
        document: listed(),
        selection: {
          type: 'Range',
          anchor: { node: id('p1-t'), offset: 1, affinity: 'after' },
          focus: { node: id('p1-t'), offset: 2, affinity: 'after' },
        },
      },
      { type: 'SplitBlock' },
      ids(),
      { nodes: standard },
    )
    if (!result.ok) throw new Error(result.error)
    expect(texts(result.state.document.children)[0]).toMatchObject({
      l: [{ i1: ['o'] }, { 'new-3': ['e'] }, {}, {}, {}, {}],
    })
  })

  it.each<[string, string, RichText.RunOptions, number, unknown]>([
    [
      'with no vocabulary',
      'p1-t',
      {},
      0,
      { l: [{ i1: ['on', 'e'] }, { i2: ['two', 'more'] }, ...rest] },
    ],
    ['in a quote, which is no item', 'pq-t', { nodes: standard }, 1, { q: ['qu', 'oted'] }],
    [
      'in a table cell, which is isolating',
      'pc-t',
      { nodes: standard },
      2,
      { t: [{ r: [{ c: ['ce', 'll'] }] }] },
    ],
  ])('splits only the block %s', (_, at, options, top, expected) => {
    const result = enter(at, 2, options)
    if (!result.ok) throw new Error(result.error)
    expect(texts(result.state.document.children)[top]).toEqual(expected)
  })
})
