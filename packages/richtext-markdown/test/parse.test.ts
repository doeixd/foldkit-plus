/**
 * Parsing Markdown into a document (§124 §1), and the round trip that verifies both
 * directions: `print(parse(markdown))` returns the same Markdown, which is §124 §14's own
 * property, in the direction that needs no parser to check.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'
import { parse } from '../src/parse.js'
import { print } from '../src/print.js'

const minted = () => {
  let count = 0
  return () => `m${++count}`
}
const parsed = (markdown: string) => parse(markdown, { mint: minted() })
const back = (markdown: string) => print(parsed(markdown).document).markdown
const asNode = (block: RichText.Block | undefined) => {
  if (block?.type !== 'Node') throw new Error('expected a node block')
  return block
}
const kindOf = (block: RichText.Block) => (block.type === 'Node' ? block.kind : block.type)

/** One block of a parsed document, as a node block. */
const at = (markdown: string, index = 0) => asNode(parsed(markdown).document.children[index])

const runs = (block: RichText.Block | undefined) =>
  block === undefined || block.type === 'Unknown' ? [] : block.children

describe('parsing Markdown into a document', () => {
  it('reads paragraphs and headings', () => {
    const document = parsed('# Title\n\nBody\n').document
    expect(document.children.map(kindOf)).toEqual(['Heading', 'Paragraph'])
    expect(document.children[0]?.type === 'Heading' && document.children[0].level).toBe(1)
    expect(runs(document.children[1]).map(run => run.text)).toEqual(['Body'])
  })

  it('reads the inline marks the printer writes, a link carrying its href', () => {
    const document = parsed(
      'a **b** *c* `d` ~~e~~ [f](/x?a=1&b=2) and a real \\*asterisk\n',
    ).document
    expect(runs(document.children[0]).map(run => [run.text, run.marks])).toEqual([
      ['a ', []],
      ['b', ['Bold']],
      [' ', []],
      ['c', ['Italic']],
      [' ', []],
      ['d', ['Code']],
      [' ', []],
      ['e', ['Strikethrough']],
      [' ', []],
      ['f', [{ name: 'Link', props: { href: '/x?a=1&b=2' } }]],
      [' and a real *asterisk', []],
    ])
  })

  it('reads a quote, a list, and a task list', () => {
    const quote = at('> one\n>\n> two\n')
    expect(quote.kind).toBe('Quote')
    expect(quote.blocks?.map(kindOf)).toEqual(['Paragraph', 'Paragraph'])

    const list = at('- a\n- [x] b\n')
    expect(list.kind).toBe('List')
    expect(list.props).toEqual({})
    expect(list.blocks?.map(kindOf)).toEqual(['ListItem', 'TaskItem'])
    const task = asNode(list.blocks?.[1])
    expect(task.props).toEqual({ checked: true })
    expect(runs(task.blocks?.[0]).map(run => run.text)).toEqual(['b'])
  })

  it('reads an ordered list from where it starts, and a nested one', () => {
    expect(at('3. three\n4. four\n').props).toEqual({ ordered: true, start: 3 })
    // `1.` is where a list starts by default, so no prop says so.
    expect(at('1. one\n').props).toEqual({ ordered: true })
    const nested = at('- one\n\n  - nested\n')
    const item = asNode(nested.blocks?.[0])
    expect(item.blocks?.map(kindOf)).toEqual(['Paragraph', 'List'])
  })

  it('reads a code block with its language, its text verbatim and unmarked', () => {
    const block = at('```ts\nconst x = 1\n```\n')
    expect(block.kind).toBe('CodeBlock')
    expect(block.props).toEqual({ language: 'ts' })
    expect(block.children.map(run => [run.text, run.marks])).toEqual([['const x = 1', []]])
  })

  it('reads a thematic break, a table, and an image line', () => {
    expect(at('---\n').kind).toBe('ThematicBreak')

    const table = at('| head |\n| --- |\n| cell |\n')
    expect(table.kind).toBe('Table')
    expect(table.blocks?.map(kindOf)).toEqual(['TableRow', 'TableRow'])
    // GFM's first row is the header, and the document now says so.
    expect(table.blocks?.map(row => (row.type === 'Node' ? row.props : {}))).toEqual([
      { header: true },
      {},
    ])
    const cell = asNode(asNode(table.blocks?.[0]).blocks?.[0])
    expect(cell.kind).toBe('TableCell')
    expect(runs(cell.blocks?.[0]).map(run => run.text)).toEqual(['head'])

    const image = at('![a](/a.png)\n')
    expect(image.kind).toBe('Image')
    expect(image.props).toEqual({ src: '/a.png', alt: 'a' })
    // An image with no alt still hoists, with the prop left out.
    expect(at('![](/a.png)\n').props).toEqual({ src: '/a.png' })
  })

  it('turns a hard break into its own paragraph, and says so', () => {
    const broken = parsed('hard  \nbreak\n')
    expect(broken.diagnostics).toEqual([{ code: 'UnsupportedNode', detail: 'break' }])
    expect(broken.document.children.map(kindOf)).toEqual(['Paragraph', 'Paragraph'])
    expect(print(broken.document).markdown).toBe('hard\n\nbreak\n')
  })

  it('reports what a document cannot hold, and keeps the rest', () => {
    expect(parsed('<div>x</div>\n').diagnostics).toEqual([
      { code: 'UnsupportedNode', detail: 'html' },
    ])
    expect(parsed('[a]: /x\n').diagnostics).toEqual([
      { code: 'UnsupportedNode', detail: 'definition' },
    ])
    // An inline image has no place among a block's runs; the text either side is still
    // one run, because dropping it leaves the same marks adjacent.
    const mixed = parsed('a ![b](/i.png) c\n')
    expect(mixed.diagnostics).toEqual([{ code: 'UnsupportedNode', detail: 'image' }])
    expect(runs(mixed.document.children[0]).map(run => run.text)).toEqual(['a  c'])
  })
})

describe('the printer and the parser round trip', () => {
  it.each([
    ['# Title\n'],
    ['one\n\ntwo\n'],
    ['> one\n>\n> two\n'],
    ['- one\n- two\n'],
    ['3. one\n4. two\n'],
    ['- one\n\n  - nested\n'],
    ['- [x] done\n- [ ] todo\n'],
    ['```ts\nconst x = 1\n```\n'],
    ['---\n'],
    ['![a](/a.png)\n'],
    ['| head |\n| --- |\n| cell |\n'],
    ['a **b** *c* `d` ~~e~~ [f](/x) and a real \\*asterisk\n'],
    ['2 \\* 3 = \\[4\\]\n'],
    ['\\# not a heading\n'],
    ['&#32;leading space\n'],
  ])('reads %j back the way it was written', markdown => {
    expect(back(markdown)).toBe(markdown)
  })

  it('reads back a document the printer wrote, not only one it could have', () => {
    const document = RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Heading',
          id: 'h',
          level: 2,
          children: [{ type: 'Text', id: 'ht', text: 'Title', marks: [] }],
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
              id: 'qp',
              children: [
                { type: 'Text', id: 'qpt', text: 'quoted ', marks: [] },
                { type: 'Text', id: 'qpu', text: 'and bold', marks: ['Bold'] },
              ],
            },
          ],
        },
        {
          type: 'Node',
          kind: 'List',
          id: 'l',
          props: { ordered: true, start: 2 },
          children: [],
          blocks: [
            {
              type: 'Node',
              kind: 'TaskItem',
              id: 'ti',
              props: { checked: false },
              children: [],
              blocks: [
                {
                  type: 'Paragraph',
                  id: 'tip',
                  children: [{ type: 'Text', id: 'tit', text: 'todo', marks: [] }],
                },
              ],
            },
          ],
        },
        {
          type: 'Node',
          kind: 'Table',
          id: 'tb',
          props: {},
          children: [],
          blocks: [
            {
              type: 'Node',
              kind: 'TableRow',
              id: 'tr',
              props: {},
              children: [],
              blocks: [
                {
                  type: 'Node',
                  kind: 'TableCell',
                  id: 'tc',
                  props: {},
                  children: [],
                  blocks: [
                    {
                      type: 'Paragraph',
                      id: 'tcp',
                      children: [{ type: 'Text', id: 'tct', text: 'cell', marks: [] }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        { type: 'Node', kind: 'Image', id: 'img', props: { src: '/a.png' }, children: [] },
      ],
    })
    const markdown = print(document).markdown
    const round = parsed(markdown)
    expect(round.diagnostics).toEqual([])
    expect(print(round.document).markdown).toBe(markdown)
  })
})
