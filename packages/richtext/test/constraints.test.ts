/**
 * The command layer refusing an edit a constraint forbids (§117, §125). `validate`
 * still reports the same violations on a document, but a caller that has the vocabulary
 * can make the edit fail at the intent instead of leaving it to the publishing gate.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const id = RichText.NodeId.make

const Quote = RichText.node('Quote', { children: RichText.blocksOf('Paragraph') })
const CodeBlock = RichText.node('CodeBlock', {
  children: RichText.textContent,
  marks: 'none',
})
const kit = RichText.kit({
  nodes: [RichText.block('Paragraph'), RichText.block('Heading'), Quote, CodeBlock],
  marks: [RichText.Bold, RichText.Italic],
})
const nodes = RichText.nodeRegistry(kit.nodes)

const document = () =>
  RichText.decodeDocument({
    version: 1,
    children: [
      {
        type: 'Paragraph',
        id: 'p',
        children: [{ type: 'Text', id: 'p-t', text: 'hi', marks: [] }],
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
        children: [{ type: 'Text', id: 'code-t', text: 'const x = 1', marks: [] }],
      },
    ],
  })

const caret = (node: string, offset: number): RichText.Selection => ({
  type: 'Range',
  anchor: { node: id(node), offset, affinity: 'after' },
  focus: { node: id(node), offset, affinity: 'after' },
})
const range = (node: string, from: number, to: number): RichText.Selection => ({
  type: 'Range',
  anchor: { node: id(node), offset: from, affinity: 'after' },
  focus: { node: id(node), offset: to, affinity: 'after' },
})
const state = (selection: RichText.Selection) => ({ document: document(), selection })
/** A fresh mint per call: an edit that mints two identities must not reuse one. */
const ids = () => {
  let n = 0
  return { mint: () => `new-${++n}` }
}
const sliceMint = () => {
  let n = 0
  return () => `s-${++n}`
}

/** A slice holding one Heading, for pasting a kind a constrained parent may exclude. */
const headingSlice = (): RichText.Slice => {
  const source = RichText.decodeDocument({
    version: 1,
    children: [
      {
        type: 'Heading',
        id: 'h',
        level: 2,
        children: [{ type: 'Text', id: 'h-t', text: 'x', marks: [] }],
      },
    ],
  })
  const slice = RichText.sliceOf(source, { type: 'Node', node: id('h') })
  if (slice === undefined) throw new Error('expected a slice')
  return slice
}

describe('a kind declared mark-free', () => {
  it('refuses adding a mark over one of its runs', () => {
    const result = RichText.run(
      state(range('code-t', 0, 5)),
      { type: 'ToggleMark', mark: 'Bold' },
      ids(),
      { nodes },
    )
    expect(result).toMatchObject({ ok: false, error: 'ForbiddenMark' })
  })

  it('refuses inserting text that carries marks into it', () => {
    const result = RichText.run(
      state(caret('code-t', 2)),
      { type: 'InsertText', text: 'x', marks: ['Bold'] },
      ids(),
      { nodes },
    )
    expect(result).toMatchObject({ ok: false, error: 'ForbiddenMark' })
  })

  it('still accepts plain text, and still allows removing a mark it carries', () => {
    expect(
      RichText.run(state(caret('code-t', 2)), { type: 'InsertText', text: 'x' }, ids(), { nodes })
        .ok,
    ).toBe(true)
    // A preserved document may hold a mark this kind forbids; removing it is not the
    // edit the rule is about, and it is the way back to validity.
    const marked = RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Node',
          kind: 'CodeBlock',
          id: 'code',
          props: {},
          children: [{ type: 'Text', id: 'code-t', text: 'x', marks: ['Bold'] }],
        },
      ],
    })
    expect(
      RichText.run(
        { document: marked, selection: range('code-t', 0, 1) },
        { type: 'ToggleMark', mark: 'Bold' },
        ids(),
        {
          nodes,
        },
      ).ok,
    ).toBe(true)
  })

  it('is not consulted when the caller gave no vocabulary', () => {
    const result = RichText.run(
      state(range('code-t', 0, 5)),
      { type: 'ToggleMark', mark: 'Bold' },
      ids(),
    )
    expect(result.ok).toBe(true)
  })
})

describe('a constrained container', () => {
  it('refuses retyping a child to a kind it excludes', () => {
    const result = RichText.run(
      state(caret('q-p-t', 3)),
      { type: 'RetypeBlock', to: { type: 'Heading', level: 2 } },
      ids(),
      { nodes },
    )
    expect(result).toMatchObject({ ok: false, error: 'UnexpectedChild' })
  })

  it('retypes freely where the parent accepts any block', () => {
    const result = RichText.run(
      state(caret('p-t', 1)),
      { type: 'RetypeBlock', to: { type: 'Heading', level: 2 } },
      ids(),
      { nodes },
    )
    expect(result.ok).toBe(true)
  })

  it('refuses pasting a child kind it excludes, and accepts one it names', () => {
    const excluded = RichText.run(
      state(caret('q-p-t', 3)),
      { type: 'Paste', slice: headingSlice() },
      ids(),
      { nodes },
    )
    expect(excluded).toMatchObject({ ok: false, error: 'UnexpectedChild' })
    const accepted = RichText.run(
      state(caret('q-p-t', 3)),
      { type: 'Paste', slice: RichText.sliceFromText('more', sliceMint()) },
      ids(),
      { nodes },
    )
    expect(accepted.ok).toBe(true)
  })

  it('does not refuse a paste into the document root', () => {
    const result = RichText.run(
      state(caret('p-t', 1)),
      { type: 'Paste', slice: headingSlice() },
      ids(),
      { nodes },
    )
    expect(result.ok).toBe(true)
  })
})

describe('naming a block', () => {
  it('reads a built-in kind, an application kind, and a preserved original type', () => {
    const blocks = document().children
    expect(RichText.blockKind(blocks[0]!)).toBe('Paragraph')
    expect(RichText.blockKind(blocks[1]!)).toBe('Quote')
    const preserved = RichText.decodeDocument({
      version: 1,
      children: [{ type: 'Embed', id: 'e', src: 'x' }],
    })
    expect(RichText.blockKind(preserved.children[0]!)).toBe('Embed')
  })
})
