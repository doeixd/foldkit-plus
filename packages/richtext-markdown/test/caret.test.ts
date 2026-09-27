/**
 * The caret across a mode switch (§147): a rich position becomes an offset in the printed
 * Markdown, and an offset in the draft becomes a position in the document it parses to.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'
import { alignedIn } from '../src/caret.js'
import { closeSource, openSource } from '../src/index.js'

const id = RichText.NodeId.make
const at = (node: string, offset: number): RichText.Position => ({
  node: id(node),
  offset,
  affinity: 'after',
})
const caret = (node: string, offset: number): RichText.Selection => ({
  type: 'Range',
  anchor: at(node, offset),
  focus: at(node, offset),
})
const minted = () => {
  let n = 0
  return { mint: () => `m${++n}` }
}
const decode = (children: ReadonlyArray<unknown>) =>
  RichText.decodeDocument({ version: 1, children } as never)

/** A paragraph holding `a*b` and a bold `cd`, which prints as `a\*b**cd**`. */
const escaped = decode([
  {
    type: 'Paragraph',
    id: 'p',
    children: [
      { type: 'Text', id: 'plain', text: 'a*b', marks: [] },
      { type: 'Text', id: 'bold', text: 'cd', marks: ['Bold'] },
    ],
  },
])

/** The run and offset a closed session's caret names, read by its text. */
const placed = (document: RichText.Document, selection: RichText.Selection | null) => {
  if (selection?.type !== 'Range') return selection
  const run = RichText.locateRun(document, selection.focus.node)?.run
  return [run?.text, selection.focus.offset]
}

describe('the caret from the rich editor into the source', () => {
  it('lands where the position’s text printed, past escapes and delimiters', () => {
    const session = openSource(escaped, { selection: caret('bold', 1) })
    expect(session.draft).toBe('a\\*b**cd**\n')
    expect(session.draft.slice(0, session.caret)).toBe('a\\*b**c')
    expect(openSource(escaped, { selection: caret('plain', 2) }).caret).toBe(3)
  })

  it('starts at the beginning when the mark changes how the text before it prints', () => {
    // Right before an opening `_`, the mark leaves it unable to open, so that print falls back
    // to canonical spellings, which turns the setext title above into `#`.
    const titled = decode([
      {
        type: 'Heading',
        id: 'h',
        level: 1,
        children: [{ type: 'Text', id: 'h-t', text: 'Title', marks: [] }],
      },
      {
        type: 'Paragraph',
        id: 'p',
        children: [
          { type: 'Text', id: 'a', text: 'x ', marks: [] },
          { type: 'Text', id: 'b', text: 'y', marks: ['Italic'] },
        ],
      },
    ])
    const style = { heading: 'setext', emphasis: '_' } as const
    expect(openSource(titled, { style }).draft).toBe('Title\n=====\n\nx _y_\n')
    expect(openSource(titled, { style, selection: caret('a', 2) }).caret).toBe(0)
    // Control: a caret elsewhere in the same text is placed.
    expect(openSource(titled, { style, selection: caret('a', 1) }).caret).toBe(14)
  })

  it('follows a range’s focus, the end the writer moved', () => {
    const range: RichText.Selection = {
      type: 'Range',
      anchor: at('plain', 0),
      focus: at('bold', 1),
    }
    expect(openSource(escaped, { selection: range }).caret).toBe(7)
  })

  it('starts at the beginning for a node selection, or none', () => {
    expect(openSource(escaped, { selection: { type: 'Node', node: id('p') } }).caret).toBe(0)
    expect(openSource(escaped).caret).toBe(0)
  })

  it('uses the spellings it prints with', () => {
    const italic = decode([
      {
        type: 'Paragraph',
        id: 'p',
        children: [
          { type: 'Text', id: 'a', text: 'x ', marks: [] },
          { type: 'Text', id: 'b', text: 'yz', marks: ['Italic'] },
        ],
      },
    ])
    const session = openSource(italic, { style: { emphasis: '_' }, selection: caret('b', 1) })
    expect(session.draft.slice(0, session.caret)).toBe('x _y')
  })
})

describe('the caret from the source back into the rich editor', () => {
  it('comes back to the same place when the draft was not edited', () => {
    const session = openSource(escaped, { selection: caret('bold', 1) })
    expect(closeSource(session, escaped, minted()).selection).toEqual(caret('bold', 1))
  })

  it.each([
    ['in marked text, after an edit before it', 'Xa\\*b**c|d**\n', ['cd', 1]],
    ['after an escape', 'a\\*|b\n', ['a*b', 2]],
    // Read from the fence line, the language's `ab` would be taken for the code's.
    ['inside a fence whose language is its text', '```ab\na|b\n```\n', ['ab', 1]],
    ['on a quote’s continuation line', '> ab\n> c|d\n', ['ab\ncd', 4]],
    [
      'on the blank line between blocks, at the end of the one before',
      'one\n\ntwo\n|\nthree\n',
      ['two', 3],
    ],
    // A refused link keeps its text, which joins the run around it.
    [
      'in a run joined from several pieces',
      'see [x](javascript:alert(1)) n|ow\n',
      ['see x now', 7],
    ],
    ['on a delimiter before any text', '|**ab**\n', ['ab', 0]],
  ] as const)('lands %s', (_, marked, expected) => {
    const draft = marked.replace('|', '')
    const session = { ...openSource(escaped), draft, caret: marked.indexOf('|') }
    const closed = closeSource(session, escaped, minted())
    expect(placed(closed.document, closed.selection)).toEqual(expected)
  })

  it('has nowhere to put a caret in a draft with no text', () => {
    const session = { ...openSource(escaped), draft: '---\n', caret: 2 }
    expect(closeSource(session, escaped, minted()).selection).toBeNull()
  })
})

describe('carrying a position between documents that hold the same text', () => {
  const two = (first: string, second: string) =>
    decode([
      {
        type: 'Paragraph',
        id: 'x',
        children: [{ type: 'Text', id: 'x1', text: first, marks: [] }],
      },
      {
        type: 'Paragraph',
        id: 'y',
        children: [
          { type: 'Text', id: 'y1', text: second.slice(0, 1), marks: [] },
          { type: 'Text', id: 'y2', text: second.slice(1), marks: ['Bold'] },
        ],
      },
    ])
  const merged = decode([
    { type: 'Paragraph', id: 'a', children: [{ type: 'Text', id: 'a1', text: 'one', marks: [] }] },
    { type: 'Paragraph', id: 'b', children: [{ type: 'Text', id: 'b1', text: 'two', marks: [] }] },
  ])

  it('finds the same block by order and the same offset in its text', () => {
    expect(alignedIn(two('one', 'two'), merged, at('y2', 1))).toEqual(at('b1', 2))
  })

  it('refuses documents whose text differs', () => {
    expect(alignedIn(two('one', 'twx'), merged, at('y2', 1))).toBeUndefined()
  })
})
