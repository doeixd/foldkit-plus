/**
 * Footnotes in Markdown: `[^label]` and `[^label]: …` read as references and definitions when a
 * caller asks for them, and print back as the same text.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'
import { closeSource, openSource, parse, print } from 'foldkit-richtext-markdown'

const minting = () => {
  let n = 0
  return () => `m${n++}`
}
/** A document's content without its identities, which two parses never share. */
const shape = (document: RichText.Document): string =>
  JSON.stringify(document, (key, value: unknown) => (key === 'id' ? undefined : value))

// Two references on one line, a note of two paragraphs, and a reference that is bold.
const source = [
  'A claim[^a] and **another[^2]**.',
  '',
  '[^a]: The first note.',
  '',
  '    Its second paragraph.',
  '',
  '[^2]: Short.',
  '',
].join('\n')

describe('footnotes in Markdown', () => {
  it('read as references showing their labels and definitions holding blocks', () => {
    const { document, diagnostics } = parse(source, { mint: minting(), footnotes: true })
    expect(diagnostics).toEqual([])
    expect(RichText.footnotesOf(document)).toEqual([
      expect.objectContaining({ label: 'a', text: 'The first note.\nIts second paragraph.' }),
      expect.objectContaining({ label: '2', text: 'Short.' }),
    ])
    const [first] = document.children
    expect(first?.children.map(run => [run.text, run.marks.map(RichText.markName)])).toEqual([
      ['A claim', []],
      ['a', ['FootnoteRef']],
      [' and ', []],
      ['another', ['Bold']],
      ['2', ['Bold', 'FootnoteRef']],
      ['.', []],
    ])
  })

  it('carry the caret into the source and back, at a reference and in a note', () => {
    const { document } = parse(source, { mint: minting(), footnotes: true })
    const reference = document.children[0]!.children[1]!
    const at = (node: RichText.NodeId, offset: number): RichText.Selection => ({
      type: 'Range',
      anchor: { node, offset, affinity: 'before' },
      focus: { node, offset, affinity: 'before' },
    })
    const opened = openSource(document, { selection: at(reference.id, 1) })
    expect(opened.draft.slice(0, opened.caret)).toBe('A claim[^a')
    const back = closeSource(opened, document, { mint: minting(), footnotes: true })
    expect(back.selection).toMatchObject({ focus: { node: reference.id, offset: 1 } })
    const definition = RichText.locateBlock(
      document,
      RichText.footnotesOf(document)[1]!.definition!,
    )!
    const noteRun =
      definition.block.type === 'Node' ? definition.block.blocks![0]!.children[0]! : undefined
    const inNote = openSource(document, { selection: at(noteRun!.id, 2) })
    expect(inNote.draft.slice(inNote.caret).startsWith('ort.')).toBe(true)
  })

  it('are reported and skipped unless asked for', () => {
    const { document, diagnostics } = parse(source, { mint: minting() })
    expect(diagnostics.map(each => each.detail)).toEqual([
      'footnoteReference',
      'footnoteReference',
      'footnoteDefinition',
      'footnoteDefinition',
    ])
    expect(RichText.toText(document.children)).toBe('A claim and another.')
  })

  it('print as text that reads back as the same document', () => {
    const { document } = parse(source, { mint: minting(), footnotes: true })
    const printed = print(document)
    expect(printed.diagnostics).toEqual([])
    const back = parse(printed.markdown, { mint: minting(), footnotes: true }).document
    expect(shape(back)).toBe(shape(document))
  })

  it('report a label GFM cannot spell, keeping its text', () => {
    const document = RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Paragraph',
          id: 'p',
          children: [
            { type: 'Text', id: 't', text: 'x', marks: [] },
            {
              type: 'Text',
              id: 'r',
              text: 'a b',
              marks: [{ name: 'FootnoteRef', props: { label: 'a b' } }],
            },
          ],
        },
        {
          type: 'Node',
          kind: 'FootnoteDefinition',
          id: 'd',
          props: { label: 'a b' },
          children: [],
          blocks: [
            {
              type: 'Paragraph',
              id: 'dp',
              children: [{ type: 'Text', id: 'dt', text: 'Note', marks: [] }],
            },
          ],
        },
      ],
    })
    const printed = print(document)
    expect(printed.diagnostics.map(each => each.code)).toEqual([
      'UnsupportedMark',
      'UnsupportedNode',
    ])
    expect(printed.markdown).toBe('xa b\n\nNote\n')
  })
})
