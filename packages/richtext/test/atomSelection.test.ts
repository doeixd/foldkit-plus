/**
 * Selecting an atom (an image, a divider) as a whole: how the keys that edit text reach it, and
 * what they do to it once it is selected.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const id = RichText.NodeId.make
const text = (block: string, value: string) => ({
  type: 'Paragraph',
  id: block,
  children: [{ type: 'Text', id: `${block}-t`, text: value, marks: [] }],
})
const image = {
  type: 'Node',
  kind: 'Image',
  id: 'image',
  props: { src: 'https://x.test/a.png' },
  children: [],
}
const document = (...children: ReadonlyArray<unknown>) =>
  RichText.decodeDocument({ version: 1, children })
const nodes = RichText.nodeRegistry(RichText.standardNodes)
const caret = (node: string, offset: number): RichText.Selection => {
  const at = { node: id(node), offset, affinity: 'after' as const }
  return { type: 'Range', anchor: at, focus: at }
}
const selected: RichText.Selection = { type: 'Node', node: id('image') }
const runOf = (state: RichText.EditorState, command: RichText.Command) => {
  let n = 0
  const result = RichText.run(state, command, { mint: () => `new-${n++}` }, { nodes })
  if (!result.ok) throw new Error(result.error)
  return result.state
}
const outline = (doc: RichText.Document): ReadonlyArray<string> =>
  doc.children.map(
    block => `${block.type === 'Node' ? block.kind : block.type}:${RichText.toText([block])}`,
  )

describe('reaching an atom from the text beside it', () => {
  it.each([
    ['Backspace at the start of the block after it', 'after-t', 0, 'DeleteBackward'],
    ['Delete at the end of the block before it', 'before-t', 6, 'DeleteForward'],
  ] as const)('%s selects it, leaving both blocks', (_, node, offset, type) => {
    const state = {
      document: document(text('before', 'Before'), image, text('after', 'After')),
      selection: caret(node, offset),
    }
    const next = runOf(state, { type })
    expect(next.selection).toEqual(selected)
    expect(outline(next.document)).toEqual(['Paragraph:Before', 'Image:', 'Paragraph:After'])
  })

  it('takes away the empty line the caret was on', () => {
    const state = {
      document: document(text('before', 'Before'), image, text('empty', '')),
      selection: caret('empty-t', 0),
    }
    const next = runOf(state, { type: 'DeleteBackward' })
    expect(next.selection).toEqual(selected)
    expect(outline(next.document)).toEqual(['Paragraph:Before', 'Image:'])
  })

  it('joins text blocks as before when no atom is between them', () => {
    const state = {
      document: document(text('before', 'Before'), text('after', 'After')),
      selection: caret('after-t', 0),
    }
    expect(outline(runOf(state, { type: 'DeleteBackward' }).document)).toEqual([
      'Paragraph:BeforeAfter',
    ])
  })
})

describe('editing a selected atom', () => {
  const state = () => ({
    document: document(text('before', 'Before'), image, text('after', 'After')),
    selection: selected,
  })

  it.each(['DeleteBackward', 'DeleteForward'] as const)('%s deletes it', type => {
    const next = runOf(state(), { type })
    expect(outline(next.document)).toEqual(['Paragraph:Before', 'Paragraph:After'])
    // Where the atom was, though it held no text to say so.
    expect(next.selection).toEqual(caret('after-t', 0))
  })

  it('opens an empty paragraph after it on Enter, the caret there', () => {
    const next = runOf(state(), { type: 'SplitBlock' })
    expect(outline(next.document)).toEqual([
      'Paragraph:Before',
      'Image:',
      'Paragraph:',
      'Paragraph:After',
    ])
    const opened = next.document.children[2]!
    expect(next.selection).toEqual(caret(opened.children[0]!.id, 0))
  })

  it('is replaced by what is typed over it', () => {
    const next = runOf(state(), { type: 'InsertText', text: 'Typed' })
    expect(outline(next.document)).toEqual([
      'Paragraph:Before',
      'Paragraph:Typed',
      'Paragraph:After',
    ])
    const typed = next.document.children[1]!
    expect(next.selection).toEqual(caret(typed.children[0]!.id, 5))
  })
})
