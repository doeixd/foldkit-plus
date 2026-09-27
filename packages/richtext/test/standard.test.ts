/**
 * The standard vocabulary (§124 §2, §125): the kinds and marks a document uses to mean
 * what Markdown and HTML also mean, and the constraints that make them more than names.
 */
import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const kit = RichText.kit({ nodes: RichText.standardNodes, marks: RichText.standardMarks })

const container = (
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
const paragraph = (id: string, marks: ReadonlyArray<unknown> = []) => ({
  type: 'Paragraph',
  id,
  children: [{ type: 'Text', id: `${id}-t`, text: 'x', marks }],
})
const doc = (children: ReadonlyArray<unknown>) => RichText.decodeDocument({ version: 1, children })

describe('the standard vocabulary', () => {
  it('names each kind once and each mark once, and nothing twice under two names', () => {
    const nodes = RichText.standardNodes.map(definition => definition.name)
    const marks = RichText.standardMarks.map(definition => definition.name)
    expect(new Set(nodes).size).toBe(nodes.length)
    expect(new Set(marks).size).toBe(marks.length)
    expect([...nodes].sort()).toEqual([
      'CodeBlock',
      'Heading',
      'Image',
      'List',
      'ListItem',
      'Paragraph',
      'Quote',
      'Table',
      'TableCell',
      'TableRow',
      'TaskItem',
      'ThematicBreak',
    ])
    // `Code` is the inline-code mark, so `InlineCode` is not a second one.
    expect([...marks].sort()).toEqual(['Bold', 'Code', 'Italic', 'Link', 'Strikethrough'])
  })

  it('validates a document that uses every kind, including nests and props', () => {
    const built = doc([
      paragraph('p', ['Bold', { name: 'Link', props: { href: '/x' } }, 'Strikethrough']),
      {
        type: 'Heading',
        id: 'h',
        level: 2,
        children: [{ type: 'Text', id: 'h-t', text: 'Title', marks: [] }],
      },
      container('Quote', 'q', {}, [paragraph('q-p')]),
      container('List', 'l', {}, [
        container('ListItem', 'li', {}, [paragraph('li-p')]),
        container('TaskItem', 'ti', { checked: true }, [paragraph('ti-p')]),
      ]),
      {
        ...container('CodeBlock', 'code', { language: 'ts' }),
        children: [{ type: 'Text', id: 'code-t', text: 'const x = 1', marks: [] }],
      },
      container('ThematicBreak', 'hr'),
      container('Image', 'img', { src: '/a.png', alt: 'a' }),
      container('Table', 'tbl', {}, [
        container('TableRow', 'tr', {}, [container('TableCell', 'tc', {}, [paragraph('tc-p')])]),
      ]),
    ])
    expect(RichText.validate(built, kit)).toEqual([])
  })

  it('reports a list that holds something other than a list item', () => {
    const invalid = doc([container('List', 'l', {}, [paragraph('p')])])
    expect(RichText.validate(invalid, kit).map(diagnostic => diagnostic.code)).toEqual([
      'UnexpectedChild',
    ])
  })

  it.each([
    [
      'a list item at the top level',
      [container('ListItem', 'i', {}, [paragraph('p')])],
      'at the top level',
    ],
    [
      'a task item in a quote',
      [
        container('Quote', 'q', {}, [
          container('TaskItem', 'i', { checked: false }, [paragraph('p')]),
        ]),
      ],
      'in "Quote"',
    ],
    [
      'a table cell straight in a table',
      [container('Table', 't', {}, [container('TableCell', 'i', {}, [paragraph('p')])])],
      'in "Table"',
    ],
  ])('reports %s, which stands only where its kind says', (_, blocks, where) => {
    const diagnostics = RichText.validate(doc(blocks), kit).filter(
      diagnostic => diagnostic.code === 'MisplacedNode',
    )
    expect(diagnostics.map(diagnostic => [diagnostic.node, diagnostic.message])).toEqual([
      ['i', expect.stringContaining(where)],
    ])
  })

  it('reports formatting inside a code block, even a declared mark', () => {
    const marked = doc([
      {
        ...container('CodeBlock', 'code'),
        children: [{ type: 'Text', id: 'code-t', text: 'x', marks: ['Bold'] }],
      },
    ])
    expect(RichText.validate(marked, kit).map(diagnostic => diagnostic.code)).toEqual([
      'ForbiddenMark',
    ])
  })

  it('reports an image without its source', () => {
    const invalid = doc([container('Image', 'img')])
    expect(RichText.validate(invalid, kit).map(diagnostic => diagnostic.code)).toEqual([
      'InvalidProps',
    ])
  })
})

describe('how the standard vocabulary renders', () => {
  const nodeBlock = (kind: string, props: Record<string, unknown> = {}) => {
    const block = doc([container(kind, 'n', props)]).children[0]
    if (block === undefined || block.type !== 'Node') throw new Error('expected a node block')
    return block
  }
  const render = (kind: string, props: Record<string, unknown> = {}) =>
    RichText.nodeRendering(RichText.standardRendering, nodeBlock(kind, props))
  const textRun = (marks: ReadonlyArray<unknown>) => {
    const block = doc([paragraph('p', marks)]).children[0]
    if (block === undefined || block.type !== 'Paragraph') throw new Error('expected a paragraph')
    const run = block.children[0]
    if (run === undefined) throw new Error('expected a run')
    return run
  }

  it('renders a list as ordered or unordered, with where it starts', () => {
    expect(render('List')).toEqual({ tag: 'ul', attributes: {} })
    expect(render('List', { ordered: true })).toEqual({ tag: 'ol', attributes: {} })
    expect(render('List', { ordered: true, start: 3 })).toEqual({
      tag: 'ol',
      attributes: { start: '3' },
    })
  })

  it('reads an image’s props into attributes and a task’s state into one', () => {
    expect(render('Image', { src: '/a.png', alt: 'a' })).toEqual({
      tag: 'img',
      attributes: { src: '/a.png', alt: 'a' },
    })
    expect(render('TaskItem', { checked: true })).toEqual({
      tag: 'li',
      attributes: { 'data-task': 'checked' },
    })
    expect(render('TaskItem', { checked: false })).toEqual({
      tag: 'li',
      attributes: { 'data-task': 'unchecked' },
    })
    expect(render('CodeBlock', { language: 'ts' })).toEqual({
      tag: 'pre',
      attributes: { 'data-language': 'ts' },
    })
  })

  it('renders the structural kinds as their own elements', () => {
    expect(render('Quote')).toEqual({ tag: 'blockquote', attributes: {} })
    expect(render('ListItem')).toEqual({ tag: 'li', attributes: {} })
    expect(render('ThematicBreak')).toEqual({ tag: 'hr', attributes: {} })
    expect(render('Table')).toEqual({ tag: 'table', attributes: {}, inner: 'tbody' })
    expect(render('TableRow')).toEqual({ tag: 'tr', attributes: {} })
    expect(render('TableRow', { header: true })).toEqual({
      tag: 'tr',
      attributes: { 'data-header': '' },
    })
    expect(render('TableCell')).toEqual({ tag: 'td', attributes: {} })
  })

  it('renders the two marks the shipped tags do not carry', () => {
    expect(
      RichText.runRendering(RichText.standardRendering, textRun(['Strikethrough'])).nest,
    ).toEqual([{ tag: 's', attributes: {} }])
    expect(
      RichText.runRendering(
        RichText.standardRendering,
        textRun([{ name: 'Link', props: { href: '/x' } }]),
      ).nest,
    ).toEqual([{ tag: 'a', attributes: { href: '/x' } }])
  })

  it('drops a link or image URL the URL policy refuses, however the document got it', () => {
    const href = (value: unknown) =>
      RichText.runRendering(
        RichText.standardRendering,
        textRun([{ name: 'Link', props: { href: value } }]),
      ).nest
    expect(href('javascript:alert(1)')).toEqual([{ tag: 'a', attributes: {} }])
    expect(href('java\tscript:alert(1)')).toEqual([{ tag: 'a', attributes: {} }])
    expect(href(42)).toEqual([{ tag: 'a', attributes: {} }])
    expect(href('mailto:a@b.test')).toEqual([{ tag: 'a', attributes: { href: 'mailto:a@b.test' } }])
    expect(render('Image', { src: 'data:text/html,x', alt: 'a' })).toEqual({
      tag: 'img',
      attributes: { alt: 'a' },
    })
    const built = doc([paragraph('p', [{ name: 'Link', props: { href: 'javascript:x' } }])])
    expect(RichText.documentToHtml(built, RichText.standardRendering)).toBe('<p><a>x</a></p>')
  })

  it('serializes as those elements, leaving a void one open', () => {
    const built = doc([
      container('List', 'l', { ordered: true, start: 2 }, [
        container('ListItem', 'li', {}, [paragraph('p')]),
      ]),
      container('Image', 'img', { src: '/a.png', alt: 'a' }),
      container('ThematicBreak', 'hr'),
    ])
    expect(RichText.documentToHtml(built, RichText.standardRendering)).toBe(
      '<ol start="2"><li><p>x</p></li></ol><img src="/a.png" alt="a"><hr>',
    )
  })

  it('puts a table’s rows in a tbody, as an HTML parser would', () => {
    const table = RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Node',
          kind: 'Table',
          id: 't',
          props: {},
          children: [],
          blocks: [
            {
              type: 'Node',
              kind: 'TableRow',
              id: 'r',
              props: {},
              children: [],
              blocks: ['a', 'b'].map(cell => ({
                type: 'Node',
                kind: 'TableCell',
                id: cell,
                props: {},
                children: [],
                blocks: [
                  {
                    type: 'Paragraph',
                    id: `${cell}-p`,
                    children: [{ type: 'Text', id: `${cell}-t`, text: cell, marks: [] }],
                  },
                ],
              })),
            },
          ],
        },
      ],
    } as never)
    expect(RichText.documentToHtml(table, RichText.standardRendering)).toBe(
      '<table><tbody><tr><td><p>a</p></td><td><p>b</p></td></tr></tbody></table>',
    )
  })
})

describe('commands that place a kind keep it where it may stand (§149)', () => {
  const nodes = RichText.nodeRegistry(RichText.standardNodes)
  const at = (node: string, offset: number) =>
    ({ node: RichText.NodeId.make(node), offset, affinity: 'after' }) as const
  const caretIn = (node: string, offset = 1): RichText.Selection => ({
    type: 'Range',
    anchor: at(node, offset),
    focus: at(node, offset),
  })
  let n = 0
  const ids = { mint: () => `new-${++n}` }
  const run = (
    blocks: ReadonlyArray<unknown>,
    selection: RichText.Selection,
    command: RichText.Command,
    options: RichText.RunOptions = { nodes },
  ) => RichText.run({ document: doc(blocks), selection }, command, ids, options)
  const refusal = (result: ReturnType<typeof run>) => (result.ok ? 'ok' : result.error)
  const item = (kind: string, id: string) =>
    RichText.decodeDocument({
      version: 1,
      children: [
        container(kind, id, kind === 'TaskItem' ? { checked: false } : {}, [paragraph(`${id}-p`)]),
      ],
    }).children

  it.each<[string, ReadonlyArray<RichText.Container>, string]>([
    ['a list item alone at the top level', [{ kind: 'ListItem' }], 'UnexpectedChild'],
    [
      'a task item straight in a quote',
      [{ kind: 'Quote' }, { kind: 'TaskItem', props: { checked: false } }],
      'UnexpectedChild',
    ],
    ['a list and its item', [{ kind: 'List' }, { kind: 'ListItem' }], 'ok'],
  ])('wraps a block in %s only where each kind may stand', (_, containers, expected) => {
    expect(refusal(run([paragraph('p')], caretIn('p-t'), { type: 'WrapBlock', containers }))).toBe(
      expected,
    )
  })

  it.each<[string, ReadonlyArray<unknown>, string, ReadonlyArray<RichText.Block>, string]>([
    [
      'a list item at the top level',
      [paragraph('p')],
      'p-t',
      item('ListItem', 'i'),
      'UnexpectedChild',
    ],
    [
      'a list item into a list item',
      [container('List', 'l', {}, [container('ListItem', 'li', {}, [paragraph('p')])])],
      'p-t',
      item('ListItem', 'i'),
      'UnexpectedChild',
    ],
    [
      'a list, which may stand anywhere',
      [paragraph('p')],
      'p-t',
      RichText.decodeDocument({
        version: 1,
        children: [container('List', 'l', {}, [container('ListItem', 'i', {}, [paragraph('q')])])],
      }).children,
      'ok',
    ],
  ])('pastes %s only where it may stand', (_, blocks, run_, pasted, expected) => {
    expect(
      refusal(run(blocks, caretIn(run_), { type: 'Paste', slice: { version: 1, blocks: pasted } })),
    ).toBe(expected)
  })

  it('starts a paragraph after a heading ended in a list item, as at the top level', () => {
    const heading = {
      type: 'Heading',
      id: 'h',
      level: 2,
      children: [{ type: 'Text', id: 'h-t', text: 'Title', marks: [] }],
    }
    const result = run(
      [container('List', 'l', {}, [container('ListItem', 'li', {}, [heading])])],
      caretIn('h-t', 5),
      { type: 'SplitBlock' },
    )
    if (!result.ok) throw new Error(result.error)
    const list = result.state.document.children[0]
    const items = list?.type === 'Node' ? (list.blocks ?? []) : []
    expect(
      items.map(each => (each.type === 'Node' ? each.blocks?.map(block => block.type) : [])),
    ).toEqual([['Heading'], ['Paragraph']])
  })

  it('refuses an item split whose props the kind’s own schema refuses', () => {
    const task = RichText.node('Task', {
      Props: Schema.Struct({ checked: Schema.Boolean }),
      children: RichText.blockContent,
      // @ts-expect-error a split's props are the kind's own
      splitProps: { checked: 'no' },
    })
    const tasks = RichText.node('Tasks', { children: RichText.blocksOf('Task') })
    const result = run(
      [container('Tasks', 'l', {}, [container('Task', 't', { checked: true }, [paragraph('p')])])],
      caretIn('p-t'),
      { type: 'SplitBlock' },
      { nodes: RichText.nodeRegistry([...RichText.standardNodes, task, tasks]) },
    )
    expect(refusal(result)).toBe('InvalidInput')
  })
})
