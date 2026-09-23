import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

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
      { type: 'Paragraph', id: 'q', children: [] },
    ],
  })

describe('html serialization', () => {
  it('renders blocks, marks, and heading levels', () => {
    expect(RichText.documentToHtml(document())).toBe(
      '<p>plain <strong>bold</strong></p><h2><code><em>Title</em></code></h2><p></p>',
    )
  })

  it('escapes text and attributes so content cannot become markup', () => {
    const hostile = RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Paragraph',
          id: 'p',
          children: [
            {
              type: 'Text',
              id: 'a',
              text: '<script>alert("x")</script> & \'quotes\'',
              marks: ['Highlight'],
            },
          ],
        },
      ],
    })
    const html = RichText.documentToHtml(hostile)
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&amp;')
    expect(html).toContain('data-marks="Highlight"')
  })

  it('keeps unknown marks and blocks visible instead of dropping them', () => {
    const future = RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Paragraph',
          id: 'p',
          children: [{ type: 'Text', id: 'a', text: 'x', marks: ['Highlight', 'Bold'] }],
        },
        { type: 'Embed', id: 'e', src: 'https://example.test/x' },
      ],
    })
    expect(RichText.documentToHtml(future)).toBe(
      '<p><span data-marks="Highlight"><strong>x</strong></span></p><div data-unknown="Embed"></div>',
    )
  })

  it('nests marks deterministically, not in the order they were added', () => {
    const first = RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Paragraph',
          id: 'p',
          children: [{ type: 'Text', id: 'a', text: 'x', marks: ['Code', 'Bold'] }],
        },
      ],
    })
    const second = RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Paragraph',
          id: 'p',
          children: [{ type: 'Text', id: 'a', text: 'x', marks: ['Bold', 'Code'] }],
        },
      ],
    })
    // Bold innermost, Code outermost, whatever order the marks arrived in.
    expect(RichText.documentToHtml(first)).toBe('<p><code><strong>x</strong></code></p>')
    expect(RichText.documentToHtml(first)).toBe(RichText.documentToHtml(second))
  })

  it('serializes a slice with the same interpreter as a document', () => {
    const slice = RichText.sliceOf(document(), {
      type: 'Range',
      anchor: { node: RichText.NodeId.make('b'), offset: 0, affinity: 'after' },
      focus: { node: RichText.NodeId.make('b'), offset: 4, affinity: 'after' },
    })!
    expect(RichText.toHtml(slice.blocks)).toBe('<p><strong>bold</strong></p>')
    expect(RichText.toText(slice.blocks)).toBe('bold')
  })

  it('renders plain text one line per block', () => {
    expect(RichText.documentToText(document())).toBe('plain bold\nTitle\n')
    expect(
      RichText.documentToText(
        RichText.decodeDocument({
          version: 1,
          children: [{ type: 'Embed', id: 'e', src: 'x' }],
        }),
      ),
    ).toBe('[Embed]')
  })
})
