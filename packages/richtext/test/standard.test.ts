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
