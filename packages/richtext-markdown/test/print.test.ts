/**
 * Printing a document as Markdown (§124 §1): CommonMark with GFM's lists, tasks,
 * strikethrough, and tables, and a diagnostic for anything the mapping cannot express.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'
import { parse, print } from '../src/index.js'

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

  it('keeps a quote holding only an empty paragraph, which reads back as a quote', () => {
    const printed = print(
      decode([
        paragraph('a', [text('ta', 'one')]),
        node('Quote', 'q', {}, [paragraph('e', [])]),
        paragraph('b', [text('tb', 'two')]),
      ]),
    ).markdown
    expect(printed).toBe('one\n\n>\n\ntwo\n')
    let n = 0
    expect(
      parse(printed, { mint: () => `r${n++}` }).document.children.map(block =>
        block.type === 'Node' ? block.kind : block.type,
      ),
    ).toEqual(['Paragraph', 'Quote', 'Paragraph'])
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

  it('reports a header row GFM cannot place, and prints the first row as the header', () => {
    const cell = (id: string, value: string) =>
      node('TableCell', id, {}, [paragraph(`${id}-p`, [text(`${id}-t`, value, [])])])
    const table = node('Table', 'tbl', {}, [
      node('TableRow', 'r1', {}, [cell('c1', 'a')]),
      node('TableRow', 'r2', { header: true }, [cell('c2', 'b')]),
    ])
    const printed = print(decode([table]))
    expect(printed.markdown).toBe('| a |\n| --- |\n| b |\n')
    expect(printed.diagnostics).toEqual([{ code: 'UnsupportedNode', detail: 'Table', node: 'tbl' }])
  })

  it('escapes what Markdown would read as markup, or as a block marker', () => {
    expect(print(inline('a', '2 * 3 = [4]')).markdown).toBe('2 \\* 3 = \\[4\\]\n')
    expect(print(inline('a', 'a_b_c')).markdown).toBe('a\\_b\\_c\n')
    expect(print(inline('a', '# not a heading')).markdown).toBe('\\# not a heading\n')
    expect(print(inline('a', '- not a list')).markdown).toBe('\\- not a list\n')
    // `\1` is no escape, so an ordered marker is broken at its delimiter instead.
    expect(print(inline('a', '1. not a list')).markdown).toBe('1\\. not a list\n')
    expect(print(inline('a', '2) not a list')).markdown).toBe('2\\) not a list\n')
    expect(print(inline('a', ' leading space')).markdown).toBe('&#32;leading space\n')
  })

  it('reports every header row GFM cannot place, not only the first', () => {
    const cell = (id: string) =>
      node('TableCell', id, {}, [paragraph(`${id}-p`, [text(`${id}-t`, id, [])])])
    const table = node('Table', 'tbl', {}, [
      node('TableRow', 'r1', { header: true }, [cell('c1')]),
      node('TableRow', 'r2', {}, [cell('c2')]),
      node('TableRow', 'r3', { header: true }, [cell('c3')]),
    ])
    expect(print(decode([table])).diagnostics).toEqual([
      { code: 'UnsupportedNode', detail: 'Table', node: 'tbl' },
    ])
  })

  it('keeps a line break inside a heading or a cell on its one line', () => {
    const cell = node('TableCell', 'c', {}, [paragraph('c-p', [text('c-t', 'a\nb', [])])])
    const printed = print(
      decode([
        heading('h', 1, [text('h-t', 'one\ntwo #', [])]),
        node('Table', 'tbl', {}, [node('TableRow', 'r', {}, [cell])]),
      ]),
    ).markdown
    // The closing `#` is escaped, or it would be read as the heading's closing sequence.
    expect(printed).toBe('# one two \\#\n\n| a b |\n| --- |\n')
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

type Runs = ReadonlyArray<readonly [string, ReadonlyArray<RichText.RunMark>]>

/** Marks as a set: the parser lists them in nesting order, and the model does not order them. */
const asSet = (marks: ReadonlyArray<RichText.RunMark>) =>
  [...marks].map(mark => JSON.stringify(mark)).sort()

/** What a parser reads back from a printed paragraph, run by run. */
const reread = (runs: Runs) => {
  let count = 0
  const printed = print(
    decode([
      paragraph(
        'p',
        runs.map(([value, marks], index) => text(`t${index}`, value, marks)),
      ),
    ]),
  ).markdown
  const [block] = parse(printed, { mint: () => `m${++count}` }).document.children
  return {
    printed,
    runs: (block?.type === 'Paragraph' ? block.children : []).map(run => [
      run.text,
      asSet(run.marks),
    ]),
  }
}

describe('what a parser reads back from the printed text', () => {
  const item = (id: string) =>
    node('ListItem', `${id}-i`, {}, [paragraph(id, [text(`${id}-t`, id)])])
  const bullets = (id: string, ...items: ReadonlyArray<string>) =>
    node('List', id, {}, items.map(item))
  const numbers = (id: string, ...items: ReadonlyArray<string>) =>
    node('List', id, { ordered: true }, items.map(item))

  it.each([
    ['two bulleted lists', [bullets('l1', 'a'), bullets('l2', 'b')], '- a\n\n* b\n'],
    ['two numbered lists', [numbers('l1', 'a'), numbers('l2', 'b')], '1. a\n\n1) b\n'],
    [
      'three in a row, alternating',
      [bullets('l1', 'a'), bullets('l2', 'b'), bullets('l3', 'c')],
      '- a\n\n* b\n\n- c\n',
    ],
    // Nothing printed between them still leaves them adjacent in the text.
    [
      'two with an unprintable block between',
      [bullets('l1', 'a'), node('Embed', 'x'), bullets('l2', 'b')],
      '- a\n\n* b\n',
    ],
    [
      'two with an empty paragraph between',
      [bullets('l1', 'a'), paragraph('e', []), bullets('l2', 'b')],
      '- a\n\n* b\n',
    ],
    [
      'a bulleted and a numbered list, which never merge',
      [bullets('l1', 'a'), numbers('l2', 'b')],
      '- a\n\n1. b\n',
    ],
    [
      'two lists a paragraph apart',
      [bullets('l1', 'a'), paragraph('p', [text('t', 'x')]), bullets('l2', 'b')],
      '- a\n\nx\n\n- b\n',
    ],
  ])('keeps %s apart', (_, blocks, expected) => {
    const printed = print(decode(blocks)).markdown
    expect(printed).toBe(expected)
    let n = 0
    const lists = parse(printed, { mint: () => `r${n++}` }).document.children.filter(
      block => block.type === 'Node' && block.kind === 'List',
    )
    expect(lists).toHaveLength(
      blocks.filter(block => 'kind' in block && block.kind === 'List').length,
    )
  })

  const link = (href: string): RichText.RunMark => ({ name: 'Link', props: { href } })

  it.each([
    ['an ordered-list marker', '1. one'],
    ['a character reference', 'a &amp; b'],
    ['inline HTML', 'a <b>c</b>'],
    ['an HTML block', '<div>x</div>'],
    ['an autolink', 'see <foo:bar>'],
    ['a block marker on a later line', 'a\n# b\n- c\n1. d\n==='],
    ['leading and trailing whitespace', '\tfirst \nsecond\t'],
  ])('keeps text that looks like %s as text', (_, value) => {
    expect(reread([[value, []]]).runs).toEqual([[value, []]])
  })

  it.each<[string, Runs]>([
    [
      'a mark two runs share',
      [
        ['a', ['Italic']],
        ['b', ['Code', 'Italic']],
      ],
    ],
    [
      'a mark nested inside another',
      [
        ['a', ['Bold']],
        ['b', ['Bold', 'Italic']],
        ['c', ['Bold']],
      ],
    ],
    [
      'a link over differently marked text',
      [
        ['a', [link('/u')]],
        ['b', ['Bold', link('/u')]],
      ],
    ],
    ['a link whose URL holds a space and parentheses', [['x', [link('/a b(c)')]]]],
    ['code with a space at both ends', [[' a ', ['Code']]]],
  ])('keeps %s', (_, runs) => {
    expect(reread(runs).runs).toEqual(runs.map(([value, marks]) => [value, asSet(marks)]))
  })

  it('keeps every mark two runs share open across them, rather than reopening it', () => {
    expect(
      reread([
        ['a', ['Bold', 'Italic']],
        ['b', ['Bold', 'Italic', 'Strikethrough']],
        ['c', ['Bold']],
      ]).printed,
      // A letter right after a delimiter that follows punctuation (here the `~~`) is written as a
      // reference, which keeps the delimiter able to close whatever reads it.
    ).toBe('***a~~b~~*&#99;**\n')
  })

  it('opens the mark that lasts longer outside, so it closes last', () => {
    // Italic lasts through both runs; opened inside bold, it would close and open again.
    const both = reread([
      ['a', ['Bold', 'Italic']],
      ['b', ['Italic']],
    ])
    expect(both.printed).toBe('***a**b*\n')
    expect(both.runs).toEqual([
      ['a', asSet(['Bold', 'Italic'])],
      ['b', asSet(['Italic'])],
    ])
  })

  it('moves a marked run’s edge whitespace outside its delimiters, keeping the text', () => {
    // `**bold **` is not emphasis, so the space leaves the mark rather than the mark the text.
    const ending = reread([
      ['bold ', ['Bold']],
      ['plain', []],
    ])
    expect(ending.printed).toBe('**bold** plain\n')
    expect(ending.runs).toEqual([
      ['bold', asSet(['Bold'])],
      [' plain', []],
    ])
    expect(
      reread([
        ['plain', []],
        [' bold', ['Bold']],
      ]).printed,
    ).toBe('plain **bold**\n')
  })
})

describe('printing what a writer could mark', () => {
  // A seeded generator: the same paragraphs on every run, and many more than a table holds.
  let seed = 7
  const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
  const pick = <A>(from: ReadonlyArray<A>): A => from[Math.floor(next() * from.length)]!
  const pieces = [
    'a',
    'b c',
    '(a)',
    '"b"',
    'x!',
    '!',
    ' a',
    'a ',
    '.',
    'a.b',
    '*',
    '_',
    '`',
    'é',
    'a|b',
    '1',
    '~',
  ]
  const link = (href: string): RichText.RunMark => ({ name: 'Link', props: { href } })
  const markings: ReadonlyArray<ReadonlyArray<RichText.RunMark>> = [
    [],
    ['Bold'],
    ['Italic'],
    ['Bold', 'Italic'],
    ['Strikethrough'],
    ['Code'],
    [link('u')],
    ['Italic', link('u')],
    ['Bold', 'Code'],
    ['Strikethrough', 'Italic'],
    ['Bold', 'Strikethrough'],
    ['Bold', link('v')],
  ]
  /** Each character with the marks on it; a space's marks are the known loss at a run's edge. */
  const marked = (document: RichText.Document) =>
    document.children.map(block =>
      block.children.flatMap(run =>
        [...run.text].map(character =>
          /\s/.test(character)
            ? character
            : [character, ...run.marks.map(mark => JSON.stringify(mark)).sort()].join(' '),
        ),
      ),
    )

  it('reads back every mark on every character of a thousand generated paragraphs', () => {
    const wrong: Array<string> = []
    for (let count = 0; count < 1000; count += 1) {
      const runs = Array.from({ length: 1 + Math.floor(next() * 6) }, (_, index) =>
        text(`r${index}`, pick(pieces), pick(markings)),
      )
      const document = decode([paragraph('p', runs)])
      const printed = print(document).markdown
      let n = 0
      const back = parse(printed, { mint: () => `m${n++}` }).document
      if (JSON.stringify(marked(back)) !== JSON.stringify(marked(document))) wrong.push(printed)
    }
    expect(wrong).toEqual([])
  })
})

describe('what a first print lost', () => {
  const again = (blocks: ReadonlyArray<unknown>) => {
    const printed = print(decode(blocks)).markdown
    let n = 0
    const read = parse(printed, { mint: () => `m${n++}` }).document
    return { printed, reprinted: print(read).markdown, read }
  }
  const kinds = (blocks: ReadonlyArray<RichText.Block>): ReadonlyArray<unknown> =>
    blocks.map(block =>
      block.type === 'Node'
        ? [block.kind, block.props, kinds(block.blocks ?? [])]
        : [block.type, block.children.map(run => run.text).join('')],
    )

  it.each<[string, ReadonlyArray<unknown>]>([
    [
      'a list nested in a task item',
      [
        node('List', 'l', {}, [
          node('TaskItem', 't', { checked: true }, [
            paragraph('a', [text('ta', 'a')]),
            node('List', 'm', {}, [
              node('TaskItem', 'u', { checked: false }, [paragraph('b', [text('tb', 'b')])]),
            ]),
          ]),
        ]),
      ],
    ],
    [
      'an empty task item',
      [node('List', 'l', {}, [node('TaskItem', 't', { checked: false }, [paragraph('e', [])])])],
    ],
    [
      'a code block whose language holds a backtick',
      [node('CodeBlock', 'c', { language: 'a`b' }, undefined)],
    ],
    [
      'a `!` right before a link',
      [paragraph('p', [text('a', '!'), text('b', 'a', [{ name: 'Link', props: { href: 'u' } }])])],
    ],
    [
      'a paragraph whose second line reads like a table’s',
      [paragraph('p', [text('a', 'a|b\n|-|-|')])],
    ],
  ])('keeps %s', (_, blocks) => {
    const { read, printed, reprinted } = again(blocks)
    expect(kinds(read.children)).toEqual(kinds(decode(blocks).children))
    expect(reprinted).toBe(printed)
  })
})

describe('reading Markdown a writer could type', () => {
  it.each(['*a *b* c*', '**a **b** c**', '_a *b* c_', '~~a ~~b~~ c~~'])(
    'reads %s, a mark nested in itself, as the mark once',
    markdown => {
      let n = 0
      const [block] = parse(markdown, { mint: () => `m${n++}` }).document.children
      expect(block?.children.map(run => run.text).join('')).toBe('a b c')
    },
  )

  it('keeps a reference link’s text, reporting the reference it cannot follow', () => {
    let n = 0
    const parsed = parse('[x][r]\n\n[r]: /u\n', { mint: () => `m${n++}` })
    expect(
      parsed.document.children.map(block => block.children.map(run => run.text).join('')),
    ).toEqual(['x'])
    expect(parsed.diagnostics.map(diagnostic => diagnostic.detail)).toContain('linkReference')
  })
})
