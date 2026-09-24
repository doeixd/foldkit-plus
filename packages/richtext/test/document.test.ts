import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const content = () => ({
  version: 1,
  children: [
    {
      type: 'Heading',
      id: 'h',
      level: 2,
      children: [{ type: 'Text', id: 'title', text: 'Hello', marks: ['Bold'] }],
    },
    {
      type: 'Paragraph',
      id: 'p',
      children: [{ type: 'Text', id: 'body', text: '🌱!', marks: ['Italic', 'Code'] }],
    },
  ],
})

describe('semantic documents', () => {
  it('round-trips content and inspects UTF-16 lengths and tree depth', () => {
    const document = RichText.decodeDocument(content())
    expect(Schema.encodeSync(RichText.Document)(document)).toEqual(content())
    expect(RichText.inspect(document)).toEqual({ nodeCount: 4, textLength: 8, depth: 2 })
    expect(RichText.inspect(RichText.decodeDocument({ version: 1, children: [] }))).toEqual({
      nodeCount: 0,
      textLength: 0,
      depth: 0,
    })
    expect(
      RichText.inspect(
        RichText.decodeDocument({
          version: 1,
          children: [{ type: 'Paragraph', id: 'p', children: [] }],
        }),
      ),
    ).toEqual({ nodeCount: 1, textLength: 0, depth: 1 })
  })

  it.each([
    ['unsupported version', { version: 2, children: [] }],
    ['unknown root data', { version: 1, children: [], focus: true }],
    ['empty id', { version: 1, children: [{ type: 'Paragraph', id: '', children: [] }] }],
    [
      'duplicate block id',
      {
        version: 1,
        children: [
          { type: 'Paragraph', id: 'x', children: [] },
          { type: 'Paragraph', id: 'x', children: [] },
        ],
      },
    ],
    [
      'block/text id collision',
      {
        version: 1,
        children: [
          {
            type: 'Paragraph',
            id: 'x',
            children: [{ type: 'Text', id: 'x', text: '', marks: [] }],
          },
        ],
      },
    ],
    [
      'duplicate text ids across blocks',
      {
        version: 1,
        children: ['a', 'b'].map(id => ({
          type: 'Paragraph',
          id,
          children: [{ type: 'Text', id: 'x', text: '', marks: [] }],
        })),
      },
    ],
    ...(
      [
        ['duplicate mark', { marks: ['Bold', 'Bold'] }],
        ['empty mark', { marks: [''] }],
        ['duplicate mark name across forms', { marks: ['Link', { name: 'Link', props: {} }] }],
        ['mark value without a name', { marks: [{ props: { href: '/x' } }] }],
        ['mark value with an empty name', { marks: [{ name: '', props: { href: '/x' } }] }],
        ['non-text value', { text: 4 }],
        ['unknown text data', { html: '<b>x</b>' }],
      ] as const
    ).map(
      ([label, patch]) =>
        [
          label,
          {
            version: 1,
            children: [
              {
                type: 'Paragraph',
                id: 'p',
                children: [{ type: 'Text', id: 't', text: 'x', marks: [], ...patch }],
              },
            ],
          },
        ] as const,
    ),
    [
      'invalid heading level',
      { version: 1, children: [{ type: 'Heading', id: 'h', level: 7, children: [] }] },
    ],
    [
      'block in inline content',
      {
        version: 1,
        children: [
          {
            type: 'Paragraph',
            id: 'p',
            children: [{ type: 'Paragraph', id: 'nested', children: [] }],
          },
        ],
      },
    ],
  ] satisfies ReadonlyArray<readonly [string, unknown]>)(
    'rejects %s without stripping content',
    (_label, input) => {
      expect(() => RichText.decodeDocument(input)).toThrow()
    },
  )

  it('round-trips a mark with props, and keeps a bare name a bare name', () => {
    const raw = {
      version: 1,
      children: [
        {
          type: 'Paragraph',
          id: 'p',
          children: [
            {
              type: 'Text',
              id: 't',
              text: 'docs',
              marks: ['Bold', { name: 'Link', props: { href: '/docs' } }],
            },
          ],
        },
      ],
    }
    const document = RichText.decodeDocument(raw)
    expect(document.children[0]?.children[0]?.marks).toEqual([
      'Bold',
      { name: 'Link', props: { href: '/docs' } },
    ])
    expect(Schema.encodeSync(RichText.Document)(document)).toEqual(raw)
  })

  it('validates range references and preserves backwards selections', () => {
    const document = RichText.decodeDocument(content())
    const position = (node: string, offset: number): RichText.Position => ({
      node: RichText.NodeId.make(node),
      offset,
      affinity: 'after',
    })
    const selection: RichText.Selection = {
      type: 'Range',
      anchor: position('body', 3),
      focus: position('title', 0),
    }
    expect(RichText.EditorState.make({ document, selection }).selection).toEqual(selection)
    for (const invalid of [position('missing', 0), position('p', 0), position('body', 4)]) {
      expect(() =>
        RichText.EditorState.make({
          document,
          selection: {
            ...selection,
            focus: invalid,
          },
        }),
      ).toThrow()
    }
    expect(RichText.selectionIsValid(document, null)).toBe(true)
    expect(
      RichText.selectionIsValid(document, { type: 'Node', node: RichText.NodeId.make('p') }),
    ).toBe(true)
    expect(
      RichText.selectionIsValid(document, { type: 'Node', node: RichText.NodeId.make('missing') }),
    ).toBe(false)
  })
})
