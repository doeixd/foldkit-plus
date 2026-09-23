// @vitest-environment jsdom
/**
 * HTML import is a security boundary, not a convenience: pasted markup comes
 * from another application, so the walk must whitelist rather than trust.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'
import { parseHtml } from '../src/html.js'

const minted = () => {
  let count = 0
  return () => `h${++count}`
}
const parse = (html: string, kit?: RichText.Kit) => parseHtml(html, { kit, mint: minted() })
const shape = (blocks: ReadonlyArray<RichText.Block>) =>
  blocks.map(block =>
    block.type === 'Unknown'
      ? { type: block.type, text: block.originalType }
      : {
          type: block.type,
          text: block.children.map(run => run.text).join(''),
          marks: block.children.map(run => run.marks),
        },
  )

describe('parsing HTML into blocks', () => {
  it('reads paragraphs, headings, and inline marks', () => {
    const parsed = parse(
      '<p>plain <strong>bold</strong> <em>and <code>code</code></em></p><h3>Title</h3>',
    )
    expect(shape(parsed.blocks)).toEqual([
      {
        type: 'Paragraph',
        text: 'plain bold and code',
        marks: [[], ['Bold'], [], ['Italic'], ['Italic', 'Code']],
      },
      { type: 'Heading', text: 'Title', marks: [[]] },
    ])
    expect(parsed.blocks[1]?.type === 'Heading' && parsed.blocks[1].level).toBe(3)
    expect(parsed.diagnostics).toEqual([])
  })

  it('treats foreign inline tags as their semantic equivalent', () => {
    const parsed = parse('<p><b>b</b><i>i</i></p>')
    expect(shape(parsed.blocks)[0]).toEqual({
      type: 'Paragraph',
      text: 'bi',
      marks: [['Bold'], ['Italic']],
    })
  })

  it('splits paragraphs at line breaks and block boundaries', () => {
    const parsed = parse('<p>one<br>two</p><div>three</div><p>four</p>')
    expect(shape(parsed.blocks).map(block => block.text)).toEqual(['one', 'two', 'three', 'four'])
  })

  it('unwraps unknown inline elements and reports them', () => {
    const parsed = parse('<p>keep <mark>this</mark> text</p>')
    expect(shape(parsed.blocks)[0]).toEqual({
      type: 'Paragraph',
      text: 'keep this text',
      marks: [[]],
    })
    expect(parsed.diagnostics).toEqual([])
  })

  it('round-trips its own export', () => {
    const document = RichText.decodeDocument({
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
          children: [{ type: 'Text', id: 'c', text: 'Title', marks: ['Italic'] }],
        },
        { type: 'Embed', id: 'e', src: 'x' },
      ],
    })
    const parsed = parse(RichText.documentToHtml(document))
    expect(shape(parsed.blocks)).toEqual([
      { type: 'Paragraph', text: 'plain bold', marks: [[], ['Bold']] },
      { type: 'Heading', text: 'Title', marks: [['Italic']] },
      { type: 'Unknown', text: 'Embed' },
    ])
    expect(parsed.diagnostics).toEqual([])
  })

  it('keeps unknown marks through the round trip', () => {
    const document = RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Paragraph',
          id: 'p',
          children: [{ type: 'Text', id: 'a', text: 'x', marks: ['Highlight'] }],
        },
      ],
    })
    const parsed = parse(RichText.documentToHtml(document))
    expect(shape(parsed.blocks)[0]).toEqual({
      type: 'Paragraph',
      text: 'x',
      marks: [['Highlight']],
    })
  })
})

describe('what import refuses', () => {
  it('drops scripting and embedding elements with their content', () => {
    const parsed = parse(
      '<p>before</p><script>alert(1)</script><style>p{color:red}</style><iframe src="https://x">frame</iframe><p>after</p>',
    )
    expect(shape(parsed.blocks).map(block => block.text)).toEqual(['before', 'after'])
    expect(JSON.stringify(parsed)).not.toContain('alert')
    // The iframe's text content is dropped with the element, not imported.
    expect(RichText.toText(parsed.blocks)).not.toContain('frame')
    expect(parsed.diagnostics.map(diagnostic => diagnostic.detail).sort()).toEqual([
      'iframe',
      'script',
      'style',
    ])
  })

  it('drops a scripting element nested inside inline markup', () => {
    const parsed = parse('<p><span>keep <script>alert(1)</script>this</span></p>')
    expect(shape(parsed.blocks)).toEqual([{ type: 'Paragraph', text: 'keep this', marks: [[]] }])
    expect(RichText.toText(parsed.blocks)).not.toContain('alert')
    expect(parsed.diagnostics).toEqual([{ code: 'Dropped', detail: 'script' }])
  })

  it('ignores every attribute except its own, so nothing executable survives', () => {
    const parsed = parse(
      '<p style="color:red" onclick="alert(1)"><a href="javascript:alert(2)" title="x">link</a></p>',
    )
    expect(shape(parsed.blocks)).toEqual([{ type: 'Paragraph', text: 'link', marks: [[]] }])
    expect(JSON.stringify(parsed)).not.toContain('javascript')
    expect(JSON.stringify(parsed)).not.toContain('onclick')
    expect(JSON.stringify(parsed)).not.toContain('style')
  })

  it('degrades a node kind the Kit does not declare', () => {
    const kit = RichText.kit({ nodes: [RichText.block('Paragraph')], marks: [RichText.Bold] })
    const parsed = parse('<h1>Title</h1>', kit)
    expect(shape(parsed.blocks)).toEqual([{ type: 'Paragraph', text: 'Title', marks: [[]] }])
    expect(parsed.diagnostics).toEqual([{ code: 'Undeclared', detail: 'Heading' }])
  })

  it('survives tag soup without throwing', () => {
    const parsed = parse('<p>unclosed<div><p>nested</p></p><strong>stray')
    expect(shape(parsed.blocks).map(block => block.text)).toEqual(['unclosed', 'nested', 'stray'])
    const empty = parse('')
    expect(empty.blocks).toEqual([])
    expect(empty.diagnostics).toEqual([])
  })
})
