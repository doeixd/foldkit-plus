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

  it('reads an application node with block children as a container', () => {
    const parsed = parse('<div data-node="List"><p>one</p><p>two</p></div>')
    const block = parsed.blocks[0]
    expect(block?.type).toBe('Node')
    if (block?.type !== 'Node') throw new Error('expected a node block')
    expect(block.kind).toBe('List')
    expect(block.children).toEqual([])
    expect(block.blocks?.map(child => child.children[0]?.text)).toEqual(['one', 'two'])
    expect(parsed.diagnostics).toEqual([])
  })

  it('reads an application node with inline content as a run holder', () => {
    const parsed = parse('<div data-node="Callout">careful <strong>now</strong></div>')
    const block = parsed.blocks[0]
    expect(block?.type).toBe('Node')
    if (block?.type !== 'Node') throw new Error('expected a node block')
    expect(block.kind).toBe('Callout')
    expect(block.blocks).toBeUndefined()
    expect(block.children.map(run => [run.text, run.marks])).toEqual([
      ['careful ', []],
      ['now', ['Bold']],
    ])
    expect(block.props).toEqual({})
  })

  it('degrades a node kind the Kit does not declare, keeping its content', () => {
    const kit = RichText.kit({ nodes: [RichText.block('Paragraph')], marks: [RichText.Bold] })
    const parsed = parse('<div data-node="Callout"><p>kept</p></div>', kit)
    expect(shape(parsed.blocks)).toEqual([{ type: 'Paragraph', text: 'kept', marks: [[]] }])
    expect(parsed.diagnostics).toEqual([{ code: 'Undeclared', detail: 'Callout' }])
  })

  it('uses a declaration to settle whether a kind holds blocks', () => {
    // The element holds only inline content, so the content alone would read as
    // a run holder; the declaration says the kind holds blocks.
    const List = RichText.node('List', { children: RichText.blockContent })
    const kit = RichText.kit({ nodes: [List, RichText.block('Paragraph')], marks: [] })
    const parsed = parse('<div data-node="List">one</div>', kit)
    const block = parsed.blocks[0]
    if (block?.type !== 'Node') throw new Error('expected a node block')
    expect(block.blocks?.map(child => child.children[0]?.text)).toEqual(['one'])
    expect(parsed.diagnostics).toEqual([])
    // Without the declaration the same markup reads as a run holder.
    const loose = parse('<div data-node="List">one</div>')
    const asRuns = loose.blocks[0]
    if (asRuns?.type !== 'Node') throw new Error('expected a node block')
    expect(asRuns.blocks).toBeUndefined()
    expect(asRuns.children.map(run => run.text)).toEqual(['one'])
  })

  it('imports a pasted list as a semantic list when the Kit declares one', () => {
    const kit = RichText.kit({
      nodes: [
        RichText.node('List', { children: RichText.blockContent }),
        RichText.node('ListItem', { children: RichText.blockContent }),
        RichText.block('Paragraph'),
      ],
      marks: [RichText.Bold],
    })
    const parsed = parse('<ul><li>one</li><li>two <strong>bold</strong></li></ul>', kit)
    expect(parsed.diagnostics).toEqual([])
    const list = parsed.blocks[0]
    if (list?.type !== 'Node') throw new Error('expected a node block')
    expect(list.kind).toBe('List')
    const items = list.blocks ?? []
    expect(items.map(item => item.type === 'Node' && item.kind)).toEqual(['ListItem', 'ListItem'])
    // Each item holds its content as a paragraph, which is what `blockContent`
    // asks for.
    const firstItem = items[0]
    if (firstItem?.type !== 'Node') throw new Error('expected an item')
    expect(firstItem.blocks?.[0]?.children.map(run => run.text)).toEqual(['one'])
    const secondItem = items[1]
    if (secondItem?.type !== 'Node') throw new Error('expected an item')
    expect(secondItem.blocks?.[0]?.children.map(run => [run.text, run.marks])).toEqual([
      ['two ', []],
      ['bold', ['Bold']],
    ])
    // The document is valid against the same Kit it was parsed with.
    expect(
      RichText.validate(
        RichText.decodeDocument(
          parsed.blocks.length > 0
            ? { version: 1, children: parsed.blocks }
            : { version: 1, children: [] },
        ),
        kit,
      ),
    ).toEqual([])
  })

  it('lets a text declaration keep a list item’s runs directly', () => {
    const kit = RichText.kit({
      nodes: [
        RichText.node('List', { children: RichText.blockContent }),
        RichText.node('ListItem', { children: RichText.textContent }),
        RichText.block('Paragraph'),
      ],
      marks: [],
    })
    const parsed = parse('<ol><li>one</li></ol>', kit)
    const list = parsed.blocks[0]
    if (list?.type !== 'Node') throw new Error('expected a node block')
    const item = list.blocks?.[0]
    if (item?.type !== 'Node') throw new Error('expected an item')
    expect(item.blocks).toBeUndefined()
    expect(item.children.map(run => run.text)).toEqual(['one'])
    expect(parsed.diagnostics).toEqual([])
  })

  it('degrades a list the Kit does not declare, keeping its content', () => {
    const kit = RichText.kit({ nodes: [RichText.block('Paragraph')], marks: [] })
    const parsed = parse('<ul><li>one</li><li>two</li></ul>', kit)
    expect(shape(parsed.blocks)).toEqual([
      { type: 'Paragraph', text: 'one', marks: [[]] },
      { type: 'Paragraph', text: 'two', marks: [[]] },
    ])
    expect(parsed.diagnostics.map(diagnostic => diagnostic.detail)).toEqual([
      'List',
      'ListItem',
      'ListItem',
    ])
  })

  it('round-trips a list through the serializer', () => {
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
              type: 'Paragraph',
              id: 'li2',
              children: [{ type: 'Text', id: 'b', text: 'two', marks: ['Bold'] }],
            },
          ],
        },
        {
          type: 'Paragraph',
          id: 'tail',
          children: [{ type: 'Text', id: 't', text: 'tail', marks: [] }],
        },
      ],
    })
    const parsed = parse(RichText.documentToHtml(list))
    const container = parsed.blocks[0]
    expect(container?.type).toBe('Node')
    if (container?.type !== 'Node') throw new Error('expected a node block')
    expect(container.kind).toBe('List')
    expect(container.blocks?.map(child => child.children[0]?.text)).toEqual(['one', 'two'])
    expect(container.blocks?.[1]?.children[0]?.marks).toEqual(['Bold'])
    expect(parsed.blocks[1]?.children[0]?.text).toBe('tail')
    expect(parsed.diagnostics).toEqual([])
    // The semantic text survives the trip through HTML.
    expect(RichText.documentToText(list)).toBe('one\ntwo\ntail')
  })

  it('round-trips an application node that holds runs', () => {
    const callout = RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Node',
          kind: 'Callout',
          id: 'c',
          props: {},
          children: [{ type: 'Text', id: 't', text: 'careful', marks: [] }],
        },
      ],
    })
    const parsed = parse(RichText.documentToHtml(callout))
    const block = parsed.blocks[0]
    expect(block?.type).toBe('Node')
    if (block?.type !== 'Node') throw new Error('expected a node block')
    expect(block.kind).toBe('Callout')
    expect(block.blocks).toBeUndefined()
    expect(block.children.map(run => run.text)).toEqual(['careful'])
  })

  it('survives tag soup without throwing', () => {
    const parsed = parse('<p>unclosed<div><p>nested</p></p><strong>stray')
    expect(shape(parsed.blocks).map(block => block.text)).toEqual(['unclosed', 'nested', 'stray'])
    const empty = parse('')
    expect(empty.blocks).toEqual([])
    expect(empty.diagnostics).toEqual([])
  })
})
