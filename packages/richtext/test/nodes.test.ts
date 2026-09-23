import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const id = RichText.NodeId.make
const callout = (props: Record<string, unknown>) =>
  RichText.decodeDocument({
    version: 1,
    children: [
      {
        type: 'Node',
        kind: 'Callout',
        id: 'c',
        props,
        children: [{ type: 'Text', id: 't', text: 'Careful', marks: ['Bold'] }],
      },
    ],
  })
const ArticleKit = RichText.kit({
  nodes: [
    RichText.block('Paragraph'),
    RichText.block('Heading'),
    RichText.node('Callout', {
      Props: Schema.Struct({ tone: Schema.Literals(['info', 'warning', 'danger']) }),
    }),
    RichText.node('Image'),
  ],
  marks: [RichText.Bold, RichText.Italic],
})

describe('application node blocks', () => {
  it('decodes props as JSON and keeps the kind and runs', () => {
    const document = callout({ tone: 'warning' })
    expect(document.children[0]).toEqual({
      type: 'Node',
      kind: 'Callout',
      id: 'c',
      props: { tone: 'warning' },
      children: [{ type: 'Text', id: 't', text: 'Careful', marks: ['Bold'] }],
    })
    // A node block is a block: it round-trips and its runs count as text.
    expect(Schema.encodeSync(RichText.Document)(document)).toEqual(document)
    expect(RichText.inspect(document)).toEqual({ nodeCount: 2, textLength: 7, depth: 2 })
  })

  it('rejects props that are not JSON, and an empty kind', () => {
    expect(() =>
      RichText.decodeDocument({
        version: 1,
        children: [
          { type: 'Node', kind: 'Callout', id: 'c', props: { load: () => 1 }, children: [] },
        ],
      }),
    ).toThrow()
    expect(() =>
      RichText.decodeDocument({
        version: 1,
        children: [{ type: 'Node', kind: '', id: 'c', props: {}, children: [] }],
      }),
    ).toThrow()
  })

  it('is editable like any block: its runs take positions and operations', () => {
    const state: RichText.EditorState = {
      document: callout({ tone: 'info' }),
      selection: null,
    }
    const result = RichText.apply(state, [
      RichText.Edit.insertText(RichText.Node.make('t').at(7, 'after'), '!'),
      RichText.Edit.splitBlock(id('c'), id('t'), 7, 'c2', 't2'),
    ])
    if (!result.ok) throw new Error(result.error)
    expect(result.state.document.children.map(block => block.id)).toEqual(['c', 'c2'])
    const [left, right] = result.state.document.children
    expect(left?.type === 'Node' && left.kind).toBe('Callout')
    expect(left?.type === 'Node' && left.props).toEqual({ tone: 'info' })
    // The split keeps the node's kind and props on both halves.
    expect(right?.type === 'Node' && right.kind).toBe('Callout')
    expect(right?.type === 'Node' && right.props).toEqual({ tone: 'info' })
  })

  it('travels through a clipboard slice with its kind and props', () => {
    const slice = RichText.sliceOf(callout({ tone: 'danger' }), {
      type: 'Node',
      node: id('c'),
    })!
    expect(slice.blocks[0]).toEqual({
      type: 'Node',
      kind: 'Callout',
      id: 'c',
      props: { tone: 'danger' },
      children: [{ type: 'Text', id: 't', text: 'Careful', marks: ['Bold'] }],
    })
    expect(RichText.serializeSlice(slice)).toContain('"kind":"Callout"')
  })

  it('renders with its kind addressable and its runs intact', () => {
    expect(RichText.documentToHtml(callout({ tone: 'info' }))).toBe(
      '<div data-node="Callout"><strong>Careful</strong></div>',
    )
    expect(RichText.documentToText(callout({ tone: 'info' }))).toBe('Careful')
  })
})

describe('kit validation of application nodes', () => {
  it('accepts declared kinds whose props decode', () => {
    expect(RichText.validate(callout({ tone: 'danger' }), ArticleKit)).toEqual([])
    expect(RichText.inspectKit(ArticleKit)).toEqual({ blocks: 2, atoms: 0, nodes: 2, marks: 2 })
  })

  it('reports an undeclared kind', () => {
    expect(
      RichText.validate(
        callout({ tone: 'info' }),
        RichText.kit({ nodes: [], marks: [RichText.Bold] }),
      ),
    ).toEqual([
      {
        code: 'UnsupportedNode',
        node: 'c',
        detail: 'Callout',
        message: 'The Kit does not declare node "Callout"',
      },
    ])
  })

  it('reports props its declared schema refuses, naming the kind', () => {
    const diagnostics = RichText.validate(callout({ tone: 'critical' }), ArticleKit)
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]?.code).toBe('InvalidProps')
    expect(diagnostics[0]?.node).toBe('c')
    expect(diagnostics[0]?.detail).toBe('Callout')
    expect(diagnostics[0]?.message).toContain('"Callout" props are invalid')
  })

  it('accepts any JSON for a node that declares no Props schema', () => {
    const image = RichText.decodeDocument({
      version: 1,
      children: [{ type: 'Node', kind: 'Image', id: 'i', props: { assetId: 'a1' }, children: [] }],
    })
    expect(RichText.validate(image, ArticleKit)).toEqual([])
  })

  it('still reports preserved unknown blocks separately', () => {
    const preserved = RichText.decodeDocument({
      version: 1,
      children: [{ type: 'Embed', id: 'e', src: 'x' }],
    })
    expect(RichText.validate(preserved, ArticleKit)).toEqual([
      {
        code: 'UnknownNode',
        node: 'e',
        detail: 'Embed',
        message: 'Unimplemented node type "Embed"',
      },
    ])
  })
})
