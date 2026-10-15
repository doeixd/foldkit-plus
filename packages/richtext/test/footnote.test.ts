/**
 * Footnotes: references tied to definitions by a label, read as one list, inserted with the next
 * free label, and renamed on both sides at once.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const id = RichText.NodeId.make
const ref = (label: string) => ({ name: 'FootnoteRef', props: { label } })
const run = (runId: string, text: string, marks: ReadonlyArray<unknown> = []) => ({
  type: 'Text',
  id: runId,
  text,
  marks,
})
const definition = (block: string, label: string, text: string) => ({
  type: 'Node',
  kind: 'FootnoteDefinition',
  id: block,
  props: { label },
  children: [],
  blocks: [{ type: 'Paragraph', id: `${block}-p`, children: [run(`${block}-t`, text)] }],
})

// Footnote 2 is referred to first in its paragraph but has no definition; 3 is defined and never
// referred to; 2's second reference shows a mark rather than its label.
const document = () =>
  RichText.decodeDocument({
    version: 1,
    children: [
      {
        type: 'Paragraph',
        id: 'p',
        children: [run('a', 'Start'), run('r1', '1', [ref('1')]), run('b', ' and more')],
      },
      {
        type: 'Paragraph',
        id: 'q',
        children: [run('c', 'Second'), run('r2', '2', [ref('2')]), run('r2b', '*', [ref('2')])],
      },
      definition('d3', '3', 'Unused'),
      definition('d1', '1', 'Note one'),
    ],
  })

const caret = (node: string, offset: number): RichText.Selection => ({
  type: 'Range',
  anchor: { node: id(node), offset, affinity: 'after' },
  focus: { node: id(node), offset, affinity: 'after' },
})
// Footnotes are opted into: an application's kit declares the reference mark.
const marks = RichText.markRegistry([...RichText.standardMarks, RichText.FootnoteRef])
const runOf = (state: RichText.EditorState, command: RichText.Command) => {
  let n = 0
  const result = RichText.run(state, command, { mint: () => `new-${n++}` }, { marks })
  if (!result.ok) throw new Error(result.error)
  return result.state
}
const textOf = (doc: RichText.Document, block: number) => RichText.toText([doc.children[block]!])

describe('the footnotes a document holds', () => {
  it('list each label once, by first reference, then the definitions nothing refers to', () => {
    expect(RichText.footnotesOf(document())).toEqual([
      { label: '1', definition: id('d1'), references: [id('r1')], text: 'Note one' },
      { label: '2', definition: undefined, references: [id('r2'), id('r2b')], text: '' },
      { label: '3', definition: id('d3'), references: [], text: 'Unused' },
    ])
  })

  it('name the next label as the smallest number not in use', () => {
    expect(RichText.nextFootnoteLabel(document())).toBe('4')
    const gap = RichText.decodeDocument({
      version: 1,
      children: [definition('d1', '1', ''), definition('d3', '3', '')],
    })
    expect(RichText.nextFootnoteLabel(gap)).toBe('2')
  })

  it('say which reference the caret is in', () => {
    expect(RichText.footnoteAt(document(), caret('r1', 1))).toBe('1')
    expect(RichText.footnoteAt(document(), caret('a', 2))).toBeUndefined()
    expect(RichText.footnoteAt(document(), null)).toBeUndefined()
  })
})

describe('InsertFootnote', () => {
  it('puts a reference at the caret and its definition last, with the caret in it', () => {
    const state = runOf(
      { document: document(), selection: caret('c', 3) },
      { type: 'InsertFootnote', text: 'A new note' },
    )
    expect(textOf(state.document, 1)).toBe('Sec4ond2*')
    const notes = RichText.footnotesOf(state.document)
    const added = notes.find(note => note.label === '4')!
    expect(added.text).toBe('A new note')
    expect(added.references).toHaveLength(1)
    const last = state.document.children[state.document.children.length - 1]!
    expect(last.id).toBe(added.definition)
    const firstRun = last.type === 'Node' ? last.blocks?.[0]?.children[0] : undefined
    expect(state.selection).toEqual(caret(firstRun!.id, 0))
  })

  it('goes after a range, keeping the text it covers', () => {
    const state = runOf(
      {
        document: document(),
        selection: {
          type: 'Range',
          anchor: { node: id('a'), offset: 5, affinity: 'before' },
          focus: { node: id('a'), offset: 0, affinity: 'after' },
        },
      },
      { type: 'InsertFootnote' },
    )
    expect(textOf(state.document, 0)).toBe('Start41 and more')
  })
})

describe('RenameFootnote', () => {
  it('relabels the definition and every reference, keeping a reference that shows a mark', () => {
    const start = { document: document(), selection: caret('a', 2) }
    const renamed = runOf(start, { type: 'RenameFootnote', from: '2', to: 'x' })
    expect(textOf(renamed.document, 1)).toBe('Secondx*')
    expect(RichText.footnotesOf(renamed.document).map(note => note.label)).toEqual(['1', 'x', '3'])
    const one = runOf(start, { type: 'RenameFootnote', from: '1', to: ' one ' })
    const note = RichText.footnotesOf(one.document).find(each => each.label === 'one')!
    expect(note.text).toBe('Note one')
    expect(textOf(one.document, 0)).toBe('Startone and more')
    // The caret was elsewhere, so it stays.
    expect(one.selection).toEqual(start.selection)
  })

  it.each([
    ['another footnote’s label', '1', '3'],
    ['a blank label', '1', '  '],
    ['a label nothing has', '9', 'x'],
  ])('refuses %s', (_, from, to) => {
    const result = RichText.run(
      { document: document(), selection: caret('a', 2) },
      { type: 'RenameFootnote', from, to },
      { mint: () => 'unused' },
      { marks },
    )
    expect(result.ok ? 'ok' : result.error).toBe('InvalidInput')
  })
})
