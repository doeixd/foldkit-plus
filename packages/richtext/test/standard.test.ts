/**
 * The standard vocabulary (§124 §2, §125): the kinds and marks a document uses to mean
 * what Markdown and HTML also mean, and the constraints that make them more than names.
 */
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
    expect(render('Table')).toEqual({ tag: 'table', attributes: {} })
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
})
