/**
 * Enter in a kind declared `lineBreaks`, as the standard `CodeBlock` is: a newline in its text,
 * not a second block; and on an empty last line, a way out to a paragraph after it.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const id = RichText.NodeId.make
const code = (text: string) =>
  RichText.decodeDocument({
    version: 1,
    children: [
      {
        type: 'Node',
        kind: 'CodeBlock',
        id: 'code',
        props: { language: 'ts' },
        children: [{ type: 'Text', id: 't', text, marks: [] }],
      },
    ],
  })
const caretAt = (offset: number): RichText.Selection => ({
  type: 'Range',
  anchor: { node: id('t'), offset, affinity: 'after' },
  focus: { node: id('t'), offset, affinity: 'after' },
})
const enter = (text: string, offset: number, nodes?: RichText.NodeRegistry) => {
  let next = 0
  const result = RichText.run(
    { document: code(text), selection: caretAt(offset) },
    { type: 'SplitBlock' },
    { mint: () => `m${next++}` },
    { nodes },
  )
  if (!result.ok) throw new Error(result.error)
  return result.state
}
const standard = RichText.nodeRegistry(RichText.standardNodes)
const kinds = (state: RichText.EditorState) =>
  state.document.children.map(block => (block.type === 'Node' ? block.kind : block.type))

describe('Enter in a code block', () => {
  it('breaks the line, in the same block, with the caret after the break', () => {
    const state = enter('ab', 1, standard)
    expect(kinds(state)).toEqual(['CodeBlock'])
    expect(state.document.children[0]!.children.map(run => run.text).join('')).toBe('a\nb')
    expect(state.selection).toMatchObject({ anchor: { offset: 2 } })
  })

  it('on an empty last line, leaves the block for a paragraph after it, without the line', () => {
    const state = enter('ab\n', 3, standard)
    expect(kinds(state)).toEqual(['CodeBlock', 'Paragraph'])
    expect(state.document.children[0]!.children.map(run => run.text).join('')).toBe('ab')
    const paragraph = state.document.children[1]!
    expect(state.selection).toMatchObject({ anchor: { node: paragraph.children[0]!.id } })
  })

  it('anywhere but the end of text ending in a break, is still a break', () => {
    expect(kinds(enter('a\n\nb', 2, standard))).toEqual(['CodeBlock'])
    // The text ends in a break, but the caret is not after it.
    const middle = enter('ab\n', 1, standard)
    expect(kinds(middle)).toEqual(['CodeBlock'])
    expect(middle.document.children[0]!.children.map(run => run.text).join('')).toBe('a\nb\n')
  })

  it('without a vocabulary to say so, splits as any block does', () => {
    expect(kinds(enter('ab', 1))).toEqual(['CodeBlock', 'CodeBlock'])
  })
})

describe('a kind that keeps line breaks but is not indented, as a note', () => {
  const Note = RichText.node('Note', { lineBreaks: true })
  const nodes = RichText.nodeRegistry([...RichText.standardNodes, Note])
  const note = (text: string): RichText.EditorState => ({
    document: RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Node',
          kind: 'Note',
          id: 'note',
          props: {},
          children: [{ type: 'Text', id: 't', text, marks: [] }],
        },
      ],
    }),
    selection: caretAt(text.length),
  })
  const runIn = (state: RichText.EditorState, command: RichText.Command) =>
    RichText.run(state, command, { mint: () => 'unused' }, { nodes })

  it('breaks the line without carrying the indentation before it', () => {
    const result = runIn(note('  indented'), { type: 'SplitBlock' })
    if (!result.ok) throw new Error(result.error)
    expect(result.state.document.children[0]!.children[0]!.text).toBe('  indented\n')
  })

  it('leaves Tab to move focus, where code takes it', () => {
    const state = note('text')
    expect(RichText.takesTab(state.document, state.selection, nodes)).toBe(false)
    expect(runIn(state, { type: 'Indent' })).toEqual({ ok: false, error: 'InvalidSelection' })
  })
})
