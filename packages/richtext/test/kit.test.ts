import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const ArticleKit = RichText.kit({
  nodes: [RichText.block('Paragraph'), RichText.block('Heading'), RichText.atom('Image')],
  marks: [RichText.Bold, RichText.Italic],
})
const document = RichText.decodeDocument({
  version: 1,
  children: [
    {
      type: 'Paragraph',
      id: 'p',
      children: [{ type: 'Text', id: 't', text: 'hi', marks: ['Bold'] }],
    },
    {
      type: 'Heading',
      id: 'h',
      level: 2,
      children: [{ type: 'Text', id: 'u', text: 'title', marks: ['Italic'] }],
    },
  ],
})

describe('kits', () => {
  it('declares node kinds and marks as plain data', () => {
    expect(ArticleKit.nodes).toEqual([
      { name: 'Paragraph', kind: 'block', children: 'text' },
      { name: 'Heading', kind: 'block', children: 'text' },
      { name: 'Image', kind: 'atom', children: 'none' },
    ])
    expect(ArticleKit.marks).toEqual([
      { name: 'Bold', expand: 'after' },
      { name: 'Italic', expand: 'after' },
    ])
    expect(RichText.inspectKit(ArticleKit)).toEqual({ blocks: 2, atoms: 1, nodes: 0, marks: 2 })
    expect(Reflect.set(ArticleKit, 'marks', [])).toBe(false)
  })

  it('accepts documents inside the vocabulary', () => {
    expect(RichText.validate(document, ArticleKit)).toEqual([])
  })

  it('reports undeclared node kinds and marks without changing the document', () => {
    const strict = RichText.kit({ nodes: [RichText.block('Paragraph')], marks: [RichText.Bold] })
    expect(RichText.validate(document, strict)).toEqual([
      {
        code: 'UnsupportedNode',
        node: 'h',
        detail: 'Heading',
        message: 'The Kit does not declare "Heading"',
      },
      {
        code: 'UnknownMark',
        node: 'u',
        detail: 'Italic',
        message: 'The Kit does not declare mark "Italic"',
      },
    ])
    expect(document.children.map(block => block.id)).toEqual(['p', 'h'])
  })

  it('reports preserved unknown nodes as the publishing blocker', () => {
    const preserved = RichText.decodeDocument({
      version: 1,
      children: [
        { type: 'Paragraph', id: 'p', children: [] },
        { type: 'Embed', id: 'e', src: 'x' },
      ],
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

  it('reports every offending mark, not just the first', () => {
    const marked = RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Paragraph',
          id: 'p',
          children: [
            { type: 'Text', id: 'a', text: 'x', marks: ['Highlight'] },
            { type: 'Text', id: 'b', text: 'y', marks: ['Link'] },
          ],
        },
      ],
    })
    expect(RichText.validate(marked, ArticleKit).map(diagnostic => diagnostic.code)).toEqual([
      'UnknownMark',
      'UnknownMark',
    ])
  })

  it('is usable as a publishing gate alongside the unknown finders', () => {
    const clean = RichText.findUnknownNodes(document).length === 0
    expect(clean && RichText.validate(document, ArticleKit).length === 0).toBe(true)
  })
})
