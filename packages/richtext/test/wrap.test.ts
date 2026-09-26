/**
 * Wrapping a block in new containers (§131): the block keeps its identity, runs, and caret,
 * and the vocabulary decides which containers it may go in.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const id = RichText.NodeId.make

const document = () =>
  RichText.decodeDocument({
    version: 1,
    children: [
      {
        type: 'Paragraph',
        id: 'first',
        children: [{ type: 'Text', id: 'first-t', text: 'one', marks: [] }],
      },
      {
        type: 'Paragraph',
        id: 'p',
        children: [{ type: 'Text', id: 'p-t', text: 'two', marks: [] }],
      },
      {
        type: 'Node',
        kind: 'Quote',
        id: 'q',
        props: {},
        children: [],
        blocks: [
          {
            type: 'Paragraph',
            id: 'q-p',
            children: [{ type: 'Text', id: 'q-p-t', text: 'quoted', marks: [] }],
          },
        ],
      },
    ],
  })

const caret = (node: string, offset: number): RichText.Selection => ({
  type: 'Range',
  anchor: { node: id(node), offset, affinity: 'after' },
  focus: { node: id(node), offset, affinity: 'after' },
})
const ids = () => {
  let n = 0
  return { mint: () => `new-${++n}` }
}
const wrap = (
  selection: RichText.Selection,
  containers: ReadonlyArray<RichText.Container>,
  options: RichText.RunOptions = {},
) =>
  RichText.run(
    { document: document(), selection },
    { type: 'WrapBlock', containers },
    ids(),
    options,
  )

/** A block tree as `kind(id)[children]`, which is what a wrap changes. */
const shape = (blocks: ReadonlyArray<RichText.Block>): ReadonlyArray<string> =>
  blocks.map(block =>
    block.type === 'Node' && block.blocks !== undefined
      ? `${block.kind}(${block.id})[${shape(block.blocks).join(', ')}]`
      : `${block.type === 'Node' ? block.kind : block.type}(${block.id})`,
  )

const standard = RichText.nodeRegistry(RichText.standardNodes)

describe('wrapping a block in new containers', () => {
  it('puts the block inside a container where it stood, keeping its runs and caret', () => {
    const result = wrap(caret('p-t', 2), [{ kind: 'Quote' }])
    if (!result.ok) throw new Error(result.error)
    expect(shape(result.state.document.children)).toEqual([
      'Paragraph(first)',
      'Quote(new-1)[Paragraph(p)]',
      'Quote(q)[Paragraph(q-p)]',
    ])
    expect(result.state.selection).toEqual(caret('p-t', 2))
  })

  it('builds a chain outermost first, with each container’s props', () => {
    const result = wrap(caret('p-t', 0), [
      { kind: 'List', props: { ordered: true, start: 3 } },
      { kind: 'ListItem' },
    ])
    if (!result.ok) throw new Error(result.error)
    expect(shape(result.state.document.children)[1]).toBe(
      'List(new-1)[ListItem(new-2)[Paragraph(p)]]',
    )
    const list = result.state.document.children[1]
    expect(list?.type === 'Node' && list.props).toEqual({ ordered: true, start: 3 })
  })

  it('wraps a nested block inside the container that holds it', () => {
    const result = wrap(caret('q-p-t', 1), [{ kind: 'List' }, { kind: 'ListItem' }], {
      nodes: standard,
    })
    if (!result.ok) throw new Error(result.error)
    expect(shape(result.state.document.children)[2]).toBe(
      'Quote(q)[List(new-1)[ListItem(new-2)[Paragraph(q-p)]]]',
    )
  })

  it.each<[string, ReadonlyArray<RichText.Container>]>([
    ['a list holding a paragraph directly', [{ kind: 'List' }]],
    ['a kind that holds text, not blocks', [{ kind: 'CodeBlock' }]],
    ['a kind the vocabulary does not declare', [{ kind: 'Callout' }]],
  ])('refuses %s where the vocabulary says so', (_, containers) => {
    expect(wrap(caret('p-t', 0), containers, { nodes: standard })).toMatchObject({
      ok: false,
      error: 'UnexpectedChild',
    })
    // Control: the same wrap goes through with no vocabulary to refuse it.
    expect(wrap(caret('p-t', 0), containers).ok).toBe(true)
  })

  it('refuses a container the parent does not accept', () => {
    const narrow = RichText.nodeRegistry([
      RichText.block('Paragraph'),
      RichText.node('Quote', { children: RichText.blocksOf('Paragraph') }),
      RichText.node('List', { children: RichText.blocksOf('ListItem') }),
      RichText.node('ListItem', { children: RichText.blockContent }),
    ])
    expect(
      wrap(caret('q-p-t', 0), [{ kind: 'List' }, { kind: 'ListItem' }], { nodes: narrow }),
    ).toMatchObject({ ok: false, error: 'UnexpectedChild' })
  })

  it('refuses a wrap in nothing', () => {
    expect(wrap(caret('p-t', 0), [])).toMatchObject({ ok: false, error: 'InvalidInput' })
  })
})

describe('converting a text block to a node kind that holds text', () => {
  const twoRuns = () =>
    RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Paragraph',
          id: 'p',
          children: [
            { type: 'Text', id: 'a', text: 'const ', marks: [] },
            { type: 'Text', id: 'b', text: 'x', marks: ['Bold'] },
          ],
        },
        {
          type: 'Node',
          kind: 'Quote',
          id: 'q',
          props: {},
          children: [],
          blocks: [
            {
              type: 'Paragraph',
              id: 'q-p',
              children: [{ type: 'Text', id: 'q-p-t', text: 'quoted', marks: [] }],
            },
          ],
        },
        {
          type: 'Node',
          kind: 'CodeBlock',
          id: 'code',
          props: {},
          children: [{ type: 'Text', id: 'code-t', text: '1', marks: [] }],
        },
      ],
    })
  const convert = (
    selection: RichText.Selection,
    to: RichText.Container,
    options: RichText.RunOptions = {},
  ) =>
    RichText.run({ document: twoRuns(), selection }, { type: 'ConvertBlock', to }, ids(), options)

  it('carries the text into the new kind, with new identities and the caret moved onto them', () => {
    const result = convert(caret('b', 1), { kind: 'CodeBlock', props: { language: 'ts' } })
    if (!result.ok) throw new Error(result.error)
    const [code] = result.state.document.children
    expect(code).toMatchObject({ type: 'Node', kind: 'CodeBlock', id: 'new-3' })
    expect(code?.type === 'Node' && code.props).toEqual({ language: 'ts' })
    expect(code?.children.map(run => [run.id, run.text, run.marks])).toEqual([
      ['new-1', 'const ', []],
      ['new-2', 'x', ['Bold']],
    ])
    // The caret was one character into the second run, and still is.
    expect(result.state.selection).toEqual(caret('new-2', 1))
  })

  it('converts a block where it stands among its siblings', () => {
    const result = RichText.run(
      { document: document(), selection: caret('p-t', 1) },
      { type: 'ConvertBlock', to: { kind: 'CodeBlock' } },
      ids(),
    )
    if (!result.ok) throw new Error(result.error)
    expect(shape(result.state.document.children)).toEqual([
      'Paragraph(first)',
      'CodeBlock(new-2)',
      'Quote(q)[Paragraph(q-p)]',
    ])
  })

  it('converts a nested block where it stands', () => {
    const result = convert(caret('q-p-t', 2), { kind: 'CodeBlock' })
    if (!result.ok) throw new Error(result.error)
    expect(shape(result.state.document.children)[1]).toBe('Quote(q)[CodeBlock(new-2)]')
  })

  it('converts only a paragraph or a heading', () => {
    expect(convert(caret('code-t', 0), { kind: 'CodeBlock' })).toMatchObject({
      ok: false,
      error: 'InvalidInput',
    })
  })

  it.each<[string, RichText.Container]>([
    ['a kind that holds blocks, not text', { kind: 'Quote' }],
    ['a kind the vocabulary does not declare', { kind: 'Callout' }],
  ])('refuses %s where the vocabulary says so', (_, to) => {
    expect(convert(caret('q-p-t', 0), to, { nodes: standard })).toMatchObject({
      ok: false,
      error: 'UnexpectedChild',
    })
    expect(convert(caret('q-p-t', 0), to).ok).toBe(true)
  })

  it('refuses a kind the parent does not accept', () => {
    const narrow = RichText.nodeRegistry([
      RichText.block('Paragraph'),
      RichText.node('Quote', { children: RichText.blocksOf('Paragraph') }),
      RichText.node('CodeBlock', { children: RichText.textContent, marks: 'none' }),
    ])
    expect(convert(caret('q-p-t', 0), { kind: 'CodeBlock' }, { nodes: narrow })).toMatchObject({
      ok: false,
      error: 'UnexpectedChild',
    })
  })

  it('refuses to carry marks into a kind that forbids them', () => {
    // `p` has a bold run and `q-p` has none, so only the first is refused.
    expect(convert(caret('a', 0), { kind: 'CodeBlock' }, { nodes: standard })).toMatchObject({
      ok: false,
      error: 'ForbiddenMark',
    })
    expect(convert(caret('q-p-t', 0), { kind: 'CodeBlock' }, { nodes: standard }).ok).toBe(true)
  })
})
