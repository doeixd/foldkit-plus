/**
 * Deleting a range that leaves its container: what selecting across several kinds of block (or
 * everything) and pressing Delete, typing, Enter or pasting does.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const id = RichText.NodeId.make
const text = (block: string, value: string) => ({
  type: 'Paragraph',
  id: block,
  children: [{ type: 'Text', id: `${block}-t`, text: value, marks: [] }],
})
const cell = (block: string, value: string) => ({
  type: 'Node',
  kind: 'TableCell',
  id: block,
  props: {},
  children: [],
  blocks: [text(`${block}-p`, value)],
})
// A paragraph, an image, a quote, a table, a code block and a closing paragraph.
const document = () =>
  RichText.decodeDocument({
    version: 1,
    children: [
      text('first', 'First words'),
      {
        type: 'Node',
        kind: 'Image',
        id: 'image',
        props: { src: 'https://x.test/a.png' },
        children: [],
      },
      {
        type: 'Node',
        kind: 'Quote',
        id: 'quote',
        props: {},
        children: [],
        blocks: [text('quoted', 'Quoted')],
      },
      {
        type: 'Node',
        kind: 'Table',
        id: 'table',
        props: {},
        children: [],
        blocks: [
          {
            type: 'Node',
            kind: 'TableRow',
            id: 'row',
            props: {},
            children: [],
            blocks: [cell('c1', 'Cell one'), cell('c2', 'Cell two')],
          },
        ],
      },
      {
        type: 'Node',
        kind: 'CodeBlock',
        id: 'code',
        props: {},
        children: [{ type: 'Text', id: 'code-t', text: 'let x', marks: [] }],
      },
      text('last', 'Last words'),
    ],
  })
const nodes = RichText.nodeRegistry(RichText.standardNodes)
const at = (node: string, offset: number) => ({
  node: id(node),
  offset,
  affinity: 'after' as const,
})
const across = (from: [string, number], to: [string, number]): RichText.EditorState => ({
  document: document(),
  selection: { type: 'Range', anchor: at(...from), focus: at(...to) },
})
const runOf = (state: RichText.EditorState, command: RichText.Command) => {
  let n = 0
  const result = RichText.run(state, command, { mint: () => `new-${n++}` }, { nodes })
  if (!result.ok) throw new Error(result.error)
  return result.state
}
const outline = (doc: RichText.Document): ReadonlyArray<string> =>
  doc.children.map(block => {
    const kind = block.type === 'Node' ? block.kind : block.type
    return `${kind}:${RichText.toText([block]).replace(/\n/g, '|')}`
  })

describe('deleting across kinds of block', () => {
  it('leaves one empty block when everything is selected, and typing then fills it', () => {
    const cleared = runOf(across(['first-t', 0], ['last-t', 10]), { type: 'DeleteBackward' })
    expect(outline(cleared.document)).toEqual(['Paragraph:'])
    expect(cleared.selection).toEqual({
      type: 'Range',
      anchor: at('first-t', 0),
      focus: at('first-t', 0),
    })
    const typed = runOf(across(['first-t', 0], ['last-t', 10]), {
      type: 'InsertText',
      text: 'Anew',
    })
    expect(outline(typed.document)).toEqual(['Paragraph:Anew'])
  })

  it('removes the blocks between, and joins the far end to the near one', () => {
    const cleared = runOf(across(['first-t', 5], ['quoted-t', 3]), { type: 'DeleteForward' })
    // The image goes whole; the quote, left empty by its paragraph moving up, goes too.
    expect(outline(cleared.document)).toEqual([
      'Paragraph:Firstted',
      'Table:Cell one|Cell two',
      'CodeBlock:let x',
      'Paragraph:Last words',
    ])
  })

  it('keeps a far end that cannot be joined beside the near one', () => {
    const cleared = runOf(across(['quoted-t', 2], ['code-t', 3]), { type: 'DeleteBackward' })
    expect(outline(cleared.document)).toEqual([
      'Paragraph:First words',
      'Image:',
      'Quote:Qu| x',
      'Paragraph:Last words',
    ])
  })

  it('only clears text where the range leaves a table cell, keeping the table', () => {
    const cleared = runOf(across(['quoted-t', 2], ['c2-p-t', 4]), { type: 'DeleteBackward' })
    expect(outline(cleared.document)).toEqual([
      'Paragraph:First words',
      'Image:',
      'Quote:Qu',
      'Table:| two',
      'CodeBlock:let x',
      'Paragraph:Last words',
    ])
  })

  it('splits at the caret that is left on Enter', () => {
    const split = runOf(across(['first-t', 5], ['last-t', 4]), { type: 'SplitBlock' })
    expect(outline(split.document)).toEqual(['Paragraph:First', 'Paragraph: words'])
  })
})

it('leaves the far end where it is when the near end’s container does not take its kind', () => {
  // `Notes` holds paragraphs only, so a heading cannot come up into it.
  const Notes = RichText.node('Notes', { children: RichText.blocksOf('Paragraph') })
  const restricted = RichText.nodeRegistry([...RichText.standardNodes, Notes])
  const state: RichText.EditorState = {
    document: RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Node',
          kind: 'Notes',
          id: 'notes',
          props: {},
          children: [],
          blocks: [text('note', 'A note')],
        },
        {
          type: 'Heading',
          id: 'h',
          level: 2,
          children: [{ type: 'Text', id: 'h-t', text: 'Heading', marks: [] }],
        },
      ],
    }),
    selection: { type: 'Range', anchor: at('note-t', 2), focus: at('h-t', 4) },
  }
  const result = RichText.run(
    state,
    { type: 'DeleteBackward' },
    { mint: () => 'unused' },
    { nodes: restricted },
  )
  if (!result.ok) throw new Error(result.error)
  expect(outline(result.state.document)).toEqual(['Notes:A ', 'Heading:ing'])
})
