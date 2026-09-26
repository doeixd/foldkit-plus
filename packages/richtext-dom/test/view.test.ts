// @vitest-environment jsdom
/**
 * The read-only renderer produces ordinary Foldkit `Html`: one interpreter for
 * SSR, static pages, CMS visitor rendering, and email, with no Message universe
 * and no DOM ownership of its own.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'
import { renderBlocks, renderDocument } from '../src/view.js'

interface VNode {
  readonly sel?: string
  readonly text?: string
  readonly children?: ReadonlyArray<VNode | string | null>
  readonly data?: { readonly attrs?: Readonly<Record<string, string>> }
}

const document = () =>
  RichText.decodeDocument({
    version: 1,
    children: [
      {
        type: 'Paragraph',
        id: 'p',
        children: [
          { type: 'Text', id: 'a', text: 'plain ', marks: [] },
          { type: 'Text', id: 'b', text: 'bold', marks: ['Bold'] },
        ],
      },
      {
        type: 'Heading',
        id: 'h',
        level: 2,
        children: [{ type: 'Text', id: 'c', text: 'Title', marks: ['Italic', 'Code'] }],
      },
      { type: 'Embed', id: 'e', src: 'x' },
    ],
  })

/** Tag names in document order, for structural assertions. */
const tags = (node: VNode | string | null): ReadonlyArray<string> => {
  if (node === null || typeof node === 'string') return []
  const own = node.sel === undefined ? [] : [node.sel]
  return [...own, ...(node.children ?? []).flatMap(tags)]
}

/** Text content of a rendered subtree. */
const text = (node: VNode | string | null): string => {
  if (node === null) return ''
  if (typeof node === 'string') return node
  if (node.text !== undefined) return node.text
  return (node.children ?? []).map(text).join('')
}

const attr = (node: VNode | string | null, key: string): string | undefined =>
  node === null || typeof node === 'string' ? undefined : node.data?.attrs?.[key]

describe('the read-only renderer', () => {
  it.each([
    ['Bold', 'strong'],
    ['Italic', 'em'],
    ['Code', 'code'],
  ] as const)('renders %s from plain and object marks', (mark, element) => {
    for (const value of [mark, { name: mark }]) {
      const content = RichText.decodeDocument({
        version: 1,
        children: [
          {
            type: 'Paragraph',
            id: 'p',
            children: [{ type: 'Text', id: 'a', text: 'x', marks: [value] }],
          },
        ],
      })
      const rendered = renderDocument(content) as unknown as VNode
      expect(tags(rendered)).toEqual(['div', 'p', element])
      expect(text(rendered)).toBe('x')
    }
  })

  it('renders blocks as elements and marks as nested elements', () => {
    const rendered = renderDocument(document()) as unknown as VNode
    // Marks nest in the same order the HTML serializer uses: Code outermost.
    expect(tags(rendered)).toEqual(['div', 'p', 'strong', 'h2', 'code', 'em', 'div'])
    expect(text(rendered)).toBe('plain boldTitle[Embed]')
  })

  it('keeps the block structure addressable', () => {
    const blocks = renderBlocks(document().children) as unknown as ReadonlyArray<VNode>
    expect(blocks.map(block => block.sel)).toEqual(['p', 'h2', 'div'])
  })

  it('renders unknown blocks as an inert placeholder', () => {
    const blocks = renderBlocks(document().children) as unknown as ReadonlyArray<VNode>
    const placeholder = blocks[2]!
    expect(attr(placeholder, 'data-unknown')).toBe('Embed')
    expect(text(placeholder)).toBe('[Embed]')
  })

  it('carries unknown marks on a span rather than dropping them', () => {
    const future = RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Paragraph',
          id: 'p',
          children: [
            { type: 'Text', id: 'a', text: 'x', marks: [{ name: 'Highlight' }, { name: 'Bold' }] },
          ],
        },
      ],
    })
    const rendered = renderDocument(future) as unknown as VNode
    expect(tags(rendered)).toEqual(['div', 'p', 'span', 'strong'])
    expect(attr(rendered.children?.[0] as VNode, 'data-marks')).toBeUndefined()
    const paragraph = rendered.children?.[0] as VNode
    expect(attr(paragraph.children?.[0] as VNode, 'data-marks')).toBe('Highlight')
  })

  it('renders application node blocks with their kind addressable', () => {
    const document = RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Node',
          kind: 'Callout',
          id: 'c',
          props: { tone: 'info' },
          children: [{ type: 'Text', id: 't', text: 'Careful', marks: ['Bold'] }],
        },
      ],
    })
    const rendered = renderDocument(document) as unknown as VNode
    const block = rendered.children?.[0] as VNode
    expect(block.sel).toBe('div')
    expect(attr(block, 'data-node')).toBe('Callout')
    expect(tags(block)).toEqual(['div', 'strong'])
    expect(text(block)).toBe('Careful')
  })

  it('renders every heading level and empty blocks', () => {
    const levels = RichText.decodeDocument({
      version: 1,
      children: [1, 2, 3, 4, 5, 6].map(level => ({
        type: 'Heading' as const,
        id: `h${level}`,
        level: level as 1 | 2 | 3 | 4 | 5 | 6,
        children: [],
      })),
    })
    const rendered = renderBlocks(levels.children) as unknown as ReadonlyArray<VNode>
    expect(rendered.map(block => block.sel)).toEqual(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
    expect(text(rendered[0]!)).toBe('')
  })

  it('renders a slice as well as a document, so previews and copies share one interpreter', () => {
    const slice = RichText.sliceOf(document(), {
      type: 'Range',
      anchor: { node: RichText.NodeId.make('b'), offset: 0, affinity: 'after' },
      focus: { node: RichText.NodeId.make('b'), offset: 4, affinity: 'after' },
    })!
    const rendered = renderBlocks(slice.blocks) as unknown as ReadonlyArray<VNode>
    expect(rendered.map(block => block.sel)).toEqual(['p'])
    expect(text(rendered[0]!)).toBe('bold')
  })

  it('renders a container with its nested blocks inside it', () => {
    const list = RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Node',
          kind: 'List',
          id: 'list',
          props: {},
          children: [],
          blocks: [
            {
              type: 'Paragraph',
              id: 'li1',
              children: [{ type: 'Text', id: 'a', text: 'one', marks: [] }],
            },
            {
              type: 'Heading',
              id: 'li2',
              level: 3,
              children: [{ type: 'Text', id: 'b', text: 'two', marks: ['Bold'] }],
            },
          ],
        },
      ],
    })
    const rendered = renderDocument(list) as unknown as VNode
    const container = rendered.children?.[0] as VNode
    expect(attr(container, 'data-node')).toBe('List')
    // The items are inside the container, in order, each addressable.
    expect(tags(container)).toEqual(['div', 'p', 'h3', 'strong'])
    expect(text(container)).toBe('onetwo')
  })

  it('renders a nested unknown block as an inert placeholder inside its container', () => {
    const list = RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Node',
          kind: 'List',
          id: 'list',
          props: {},
          children: [],
          blocks: [{ type: 'Embed', id: 'e', src: 'x' }],
        },
      ],
    })
    const container = (renderDocument(list) as unknown as VNode).children?.[0] as VNode
    const placeholder = container.children?.[0] as VNode
    expect(attr(placeholder, 'data-unknown')).toBe('Embed')
    expect(text(placeholder)).toBe('[Embed]')
  })
})

describe('the read-only renderer with a rendering registry', () => {
  const links = RichText.rendering({
    marks: {
      Link: mark => ({
        tag: 'a',
        attributes: { href: String(RichText.markProps(mark)?.href ?? '') },
      }),
    },
  })

  it('renders a declared mark as its element, with the shipped marks inside it', () => {
    const content = RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Paragraph',
          id: 'p',
          children: [
            {
              type: 'Text',
              id: 'a',
              text: 'docs',
              marks: [{ name: 'Link', props: { href: '/x' } }, 'Bold'],
            },
          ],
        },
      ],
    })
    const paragraph = (renderDocument(content, links) as unknown as VNode).children?.[0] as VNode
    expect(tags(paragraph)).toEqual(['p', 'a', 'strong'])
    expect(attr(paragraph.children?.[0] as VNode, 'href')).toBe('/x')
    expect(text(paragraph)).toBe('docs')
  })

  it('renders a declared node kind as its element, with attributes from its props', () => {
    const renderer = RichText.rendering({
      nodes: {
        Callout: block => ({
          tag: 'aside',
          attributes: { 'data-tone': String(block.props.tone ?? '') },
        }),
      },
    })
    const content = RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Node',
          kind: 'Callout',
          id: 'c',
          props: { tone: 'warn' },
          children: [{ type: 'Text', id: 't', text: 'Careful', marks: ['Bold'] }],
        },
      ],
    })
    const block = (renderDocument(content, renderer) as unknown as VNode).children?.[0] as VNode
    expect(block.sel).toBe('aside')
    expect(attr(block, 'data-tone')).toBe('warn')
    expect(tags(block)).toEqual(['aside', 'strong'])
  })

  it('lets an entry replace a shipped mark or the default node element', () => {
    const renderer = RichText.rendering({
      marks: { Bold: { tag: 'b', attributes: {} } },
      nodes: { Callout: { tag: 'section', attributes: {} } },
    })
    const content = RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Node',
          kind: 'Callout',
          id: 'c',
          props: {},
          children: [{ type: 'Text', id: 't', text: 'x', marks: ['Bold'] }],
        },
      ],
    })
    const block = (renderDocument(content, renderer) as unknown as VNode).children?.[0] as VNode
    expect(block.sel).toBe('section')
    expect(tags(block)).toEqual(['section', 'b'])
  })

  it('reports a tag Foldkit cannot build rather than swapping in another element', () => {
    const paragraph = RichText.decodeDocument({
      version: 1,
      children: [
        { type: 'Paragraph', id: 'p', children: [{ type: 'Text', id: 'a', text: 'x', marks: [] }] },
      ],
    })
    // `my-widget` is not a tag Foldkit can build, and `Attribute` names an
    // attribute builder rather than an element — neither may become an element.
    for (const tag of ['my-widget', 'Attribute']) {
      const renderer = RichText.rendering({ marks: { Bold: { tag, attributes: {} } } })
      const marked = RichText.decodeDocument({
        version: 1,
        children: [
          {
            type: 'Paragraph',
            id: 'p',
            children: [{ type: 'Text', id: 'a', text: 'x', marks: ['Bold'] }],
          },
        ],
      })
      expect(() => renderDocument(marked, renderer)).toThrow(/no element for/)
    }
    expect(tags(renderDocument(paragraph) as unknown as VNode)).toEqual(['div', 'p'])
  })
})

describe('decorations over the read-only renderer (§64)', () => {
  const at = (node: string, offset: number): RichText.Position => ({
    node: RichText.NodeId.make(node),
    offset,
    affinity: 'after',
  })
  const decoration = (
    from: readonly [string, number],
    to: readonly [string, number],
    kind = 'search',
  ): RichText.Decoration => ({ from: at(from[0], from[1]), to: at(to[0], to[1]), kind })

  /** The first element carrying a decoration, wherever it sits. */
  const decorated = (node: VNode | string | null): VNode | undefined => {
    if (node === null || typeof node === 'string') return undefined
    if (attr(node, 'data-decoration') !== undefined) return node
    for (const child of node.children ?? []) {
      const found = decorated(child)
      if (found !== undefined) return found
    }
    return undefined
  }

  it('wraps the covered text in an element carrying the kind', () => {
    const rendered = renderDocument(document(), RichText.noRendering, [
      decoration(['a', 0], ['a', 5]),
    ]) as unknown as VNode
    const span = decorated(rendered)
    expect(attr(span ?? null, 'data-decoration')).toBe('search')
    expect(text(span ?? null)).toBe('plain')
  })

  it('cuts the run at the decoration’s edges and leaves the rest bare', () => {
    const rendered = renderDocument(document(), RichText.noRendering, [
      decoration(['b', 1], ['b', 3]),
    ]) as unknown as VNode
    // Run `b` is `bold`: `b` before, `ol` covered, `d` after.
    expect(text(rendered)).toContain('bold')
    expect(text(decorated(rendered) ?? null)).toBe('ol')
  })

  it('keeps the run’s marks inside the decoration, so a stylesheet sees both', () => {
    const rendered = renderDocument(document(), RichText.noRendering, [
      decoration(['b', 0], ['b', 4]),
    ]) as unknown as VNode
    const span = decorated(rendered)
    expect(tags(span ?? null)).toEqual(['span', 'strong'])
    expect(text(span ?? null)).toBe('bold')
  })

  it('renders exactly as before when the set is empty', () => {
    expect(renderDocument(document())).toEqual(renderDocument(document(), RichText.noRendering, []))
  })

  it('draws a search the core found, with no hand-made decoration', () => {
    const content = RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Paragraph',
          id: 'p',
          children: [{ type: 'Text', id: 'a', text: 'find me', marks: [] }],
        },
      ],
    })
    const rendered = renderDocument(
      content,
      RichText.noRendering,
      RichText.searchDecorations(content, 'me'),
    ) as unknown as VNode
    expect(attr(decorated(rendered) ?? null, 'data-decoration')).toBe('search')
    expect(text(decorated(rendered) ?? null)).toBe('me')
  })

  it('draws a code block’s tokens, found by a tokenizer for its language', () => {
    const content = RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Node',
          kind: 'CodeBlock',
          id: 'c',
          props: { language: 'json' },
          children: [{ type: 'Text', id: 'a', text: '[42]', marks: [] }],
        },
      ],
    })
    const numbers: RichText.CodeTokenizer = () => [{ from: 1, to: 3, kind: 'syntax-number' }]
    const rendered = renderDocument(
      content,
      RichText.standardRendering,
      RichText.codeDecorations(content, new Map([['json', numbers]])),
    ) as unknown as VNode
    expect(attr(decorated(rendered) ?? null, 'data-decoration')).toBe('syntax-number')
    expect(text(decorated(rendered) ?? null)).toBe('42')
  })
})

describe('the standard vocabulary through the read-only renderer', () => {
  it('builds each kind’s element, including the void ones', () => {
    const content = RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Node',
          kind: 'List',
          id: 'l',
          props: {},
          children: [],
          blocks: [
            {
              type: 'Node',
              kind: 'ListItem',
              id: 'li',
              props: {},
              children: [],
              blocks: [
                {
                  type: 'Paragraph',
                  id: 'p',
                  children: [{ type: 'Text', id: 't', text: 'one', marks: [] }],
                },
              ],
            },
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
              children: [{ type: 'Text', id: 'q-t', text: 'quoted', marks: [] }],
            },
          ],
        },
        { type: 'Node', kind: 'ThematicBreak', id: 'hr', props: {}, children: [] },
        {
          type: 'Node',
          kind: 'Image',
          id: 'img',
          props: { src: '/a.png', alt: 'a' },
          children: [],
        },
      ],
    })
    const rendered = renderDocument(content, RichText.standardRendering) as unknown as VNode
    expect(tags(rendered)).toEqual(['div', 'ul', 'li', 'p', 'blockquote', 'p', 'hr', 'img'])
    expect(attr(rendered.children?.[3] ?? null, 'src')).toBe('/a.png')
  })
})
