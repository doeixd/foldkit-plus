/**
 * The outline: a document's headings in order, and the section a selection is in.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const id = RichText.NodeId.make

const text = (block: string, run: string, value: string) => ({
  type: 'Paragraph' as const,
  id: block,
  children: [{ type: 'Text' as const, id: run, text: value, marks: [] }],
})
const heading = (block: string, run: string, level: number, value: string) => ({
  ...text(block, run, value),
  type: 'Heading' as const,
  level,
})

// A heading after the caret's block, one inside a quote, and one with no text, so an outline that
// stopped short, skipped containers or kept blanks reads differently.
const document = RichText.decodeDocument({
  version: 1,
  children: [
    text('lead', 'r0', 'Before any heading'),
    heading('h1', 'r1', 1, 'Intro'),
    text('p1', 'r2', 'one'),
    {
      type: 'Node',
      kind: 'Quote',
      id: 'quote',
      props: {},
      children: [],
      blocks: [heading('h2', 'r3', 2, 'Quoted'), text('p2', 'r4', 'two')],
    },
    heading('blank', 'r5', 2, '  '),
    text('p3', 'r6', 'three'),
    heading('h3', 'r7', 3, 'End'),
  ],
})

const caret = (run: string): RichText.Selection => ({
  type: 'Range',
  anchor: { node: id(run), offset: 0, affinity: 'after' },
  focus: { node: id(run), offset: 0, affinity: 'after' },
})

describe('the outline', () => {
  it('lists the headings with text, in document order, inside containers too', () => {
    expect(RichText.outlineOf(document)).toEqual([
      { node: id('h1'), level: 1, text: 'Intro' },
      { node: id('h2'), level: 2, text: 'Quoted' },
      { node: id('h3'), level: 3, text: 'End' },
    ])
  })

  it.each([
    ['r0', undefined],
    ['r1', 'h1'],
    ['r2', 'h1'],
    ['r4', 'h2'],
    // A heading with no text starts no section.
    ['r6', 'h2'],
    ['r7', 'h3'],
  ] as const)('puts a caret in %s in the section of %s', (run, section) => {
    expect(RichText.sectionAt(document, caret(run))).toBe(section)
  })

  it('has no section without a selection', () => {
    expect(RichText.sectionAt(document, null)).toBeUndefined()
  })
})
