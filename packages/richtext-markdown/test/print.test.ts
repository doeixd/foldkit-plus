/**
 * Printing a document as Markdown (§124 §1): CommonMark with GFM's lists, tasks,
 * strikethrough, and tables, and a diagnostic for anything the mapping cannot express.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'
import { print } from '../src/index.js'

const decode = (children: ReadonlyArray<unknown>) =>
  RichText.decodeDocument({ version: 1, children } as never)
const text = (id: string, value: string, marks: ReadonlyArray<RichText.RunMark> = []) => ({
  type: 'Text',
  id,
  text: value,
  marks,
})
const paragraph = (id: string, runs: ReadonlyArray<unknown>) => ({
  type: 'Paragraph',
  id,
  children: runs,
})
const heading = (id: string, level: number, runs: ReadonlyArray<unknown>) => ({
  type: 'Heading',
  id,
  level,
  children: runs,
})
const node = (
  kind: string,
  id: string,
  props: Record<string, unknown> = {},
  blocks?: ReadonlyArray<unknown>,
) => ({
  type: 'Node',
  kind,
  id,
  props,
  children: [],
  ...(blocks === undefined ? {} : { blocks }),
})
const item = (id: string, runs: ReadonlyArray<unknown>, kind = 'ListItem', props = {}) =>
  node(kind, id, props, [paragraph(`${id}-p`, runs)])
const inline = (id: string, value: string, marks: ReadonlyArray<RichText.RunMark> = []) =>
  decode([paragraph(id, [text(`${id}-t`, value, marks)])])

describe('printing a document as Markdown', () => {
  it('prints paragraphs and headings, and separates blocks with a blank line', () => {
    const document = decode([
      paragraph('p', [text('t', 'hello ', []), text('u', 'world', ['Bold'])]),
      heading('h', 2, [text('v', 'Title', [])]),
    ])
    expect(print(document).markdown).toBe('hello **world**\n\n## Title\n')
    expect(print(document).diagnostics).toEqual([])
  })

  it('prints an empty document as nothing', () => {
    expect(print(decode([])).markdown).toBe('')
  })

  it('marks every line of a quote, a blank one included', () => {
    const document = decode([
      node('Quote', 'q', {}, [
        paragraph('p1', [text('t1', 'one', [])]),
        paragraph('p2', [text('t2', 'two', [])]),
      ]),
    ])
    expect(print(document).markdown).toBe('> one\n>\n> two\n')
  })

  it('prints an unordered list, and an ordered one from where it starts', () => {
    const items = [item('a', [text('a-t', 'one', [])]), item('b', [text('b-t', 'two', [])])]
    expect(print(decode([node('List', 'l', {}, items)])).markdown).toBe('- one\n- two\n')
    expect(print(decode([node('List', 'l', { ordered: true, start: 3 }, items)])).markdown).toBe(
      '3. one\n4. two\n',
    )
  })

  it('keeps a second block inside its item, aligned under the marker', () => {
    const document = decode([
      node('List', 'l', {}, [
        node('ListItem', 'li', {}, [
          paragraph('p1', [text('t1', 'one', [])]),
          node('List', 'inner', {}, [item('a', [text('a-t', 'nested', [])])]),
        ]),
      ]),
    ])
    expect(print(document).markdown).toBe('- one\n\n  - nested\n')
  })

  it('prints a task item as GFM’s checkbox, checked or not', () => {
    const document = decode([
      node('List', 'l', {}, [
        item('a', [text('a-t', 'done', [])], 'TaskItem', { checked: true }),
        item('b', [text('b-t', 'todo', [])], 'TaskItem', { checked: false }),
      ]),
    ])
    expect(print(document).markdown).toBe('- [x] done\n- [ ] todo\n')
  })

  it('prints a fenced code block with its language, and no marks inside it', () => {
    const document = decode([
      {
        type: 'Node',
        kind: 'CodeBlock',
        id: 'c',
        props: { language: 'ts' },
        children: [text('t', 'const x = 1', ['Bold'])],
      },
    ])
    expect(print(document).markdown).toBe('```ts\nconst x = 1\n```\n')
  })

  it('fences a code block with backticks in it with a longer fence', () => {
    const document = decode([
      {
        type: 'Node',
        kind: 'CodeBlock',
        id: 'c',
        props: {},
        children: [text('t', 'a ``` b', [])],
      },
    ])
    expect(print(document).markdown).toBe('````\na ``` b\n````\n')
  })

  it('prints each mark’s syntax, with a link outside the marks it holds', () => {
    expect(print(inline('a', 'x', ['Italic'])).markdown).toBe('*x*\n')
    expect(print(inline('a', 'x', ['Italic', 'Bold'])).markdown).toBe('***x***\n')
    expect(print(inline('a', 'x', ['Strikethrough'])).markdown).toBe('~~x~~\n')
    expect(print(inline('a', 'x', ['Code'])).markdown).toBe('`x`\n')
    expect(print(inline('a', 'x', [{ name: 'Link', props: { href: '/a' } }])).markdown).toBe(
      '[x](/a)\n',
    )
    // The link is outermost, so the marked text is its label.
    expect(
      print(inline('a', 'x', ['Bold', { name: 'Link', props: { href: '/a' } }])).markdown,
    ).toBe('[**x**](/a)\n')
  })

  it('prints a thematic break, an image, and a table', () => {
    const cell = (id: string, value: string) =>
      node('TableCell', id, {}, [paragraph(`${id}-p`, [text(`${id}-t`, value, [])])])
    const document = decode([
      node('ThematicBreak', 'hr'),
      node('Image', 'img', { src: '/a.png', alt: 'a' }),
      node('Table', 'tbl', {}, [
        node('TableRow', 'r1', {}, [cell('c1', 'head')]),
        node('TableRow', 'r2', {}, [cell('c2', 'cell')]),
      ]),
    ])
    expect(print(document).markdown).toBe('---\n\n![a](/a.png)\n\n| head |\n| --- |\n| cell |\n')
  })

  it('escapes what Markdown would read as markup, or as a block marker', () => {
    expect(print(inline('a', '2 * 3 = [4]')).markdown).toBe('2 \\* 3 = \\[4\\]\n')
    expect(print(inline('a', 'a_b_c')).markdown).toBe('a\\_b\\_c\n')
    expect(print(inline('a', '# not a heading')).markdown).toBe('\\# not a heading\n')
    expect(print(inline('a', '- not a list')).markdown).toBe('\\- not a list\n')
    expect(print(inline('a', '1. not a list')).markdown).toBe('\\1. not a list\n')
    expect(print(inline('a', ' leading space')).markdown).toBe('&#32;leading space\n')
  })

  it('reports what it cannot express, and keeps the content it can', () => {
    const callout = node('Callout', 'c', {}, [paragraph('p', [text('t', 'inside', [])])])
    const nested = print(decode([callout]))
    expect(nested.markdown).toBe('inside\n')
    expect(nested.diagnostics).toEqual([{ code: 'UnsupportedNode', detail: 'Callout', node: 'c' }])

    const preserved = RichText.decodeDocument({
      version: 1,
      children: [{ type: 'Embed', id: 'e', src: 'x' }],
    })
    expect(print(preserved).markdown).toBe('')
    expect(print(preserved).diagnostics).toEqual([
      { code: 'UnsupportedNode', detail: 'Embed', node: 'e' },
    ])

    const marked = print(inline('a', 'x', ['Highlight']))
    expect(marked.markdown).toBe('x\n')
    expect(marked.diagnostics).toEqual([
      { code: 'UnsupportedMark', detail: 'Highlight', node: 'a-t' },
    ])

    // A link with nothing to link to keeps its label and says so.
    const unlinked = print(inline('a', 'x', [{ name: 'Link' }]))
    expect(unlinked.markdown).toBe('x\n')
    expect(unlinked.diagnostics).toEqual([{ code: 'UnsupportedMark', detail: 'Link', node: 'a-t' }])
  })
})
