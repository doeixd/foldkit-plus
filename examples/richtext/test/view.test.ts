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
})
