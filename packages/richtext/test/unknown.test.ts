import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const loaded = () =>
  RichText.decodeDocument({
    version: 1,
    children: [
      {
        type: 'Paragraph',
        id: 'p',
        children: [
          { type: 'Text', id: 't', text: 'Hello', marks: ['Bold', 'Highlight'] },
          { type: 'Text', id: 'other', text: 'plain', marks: [] },
        ],
      },
    ],
  })
const success = (result: RichText.TransactionResult) => {
  if (!result.ok) throw new Error(result.error)
  return result
}

describe('unknown marks', () => {
  it('loads unknown marks verbatim and round-trips them byte-equal', () => {
    const raw = {
      version: 1,
      children: [
        {
          type: 'Paragraph',
          id: 'p',
          children: [{ type: 'Text', id: 't', text: 'Hello', marks: ['Highlight', 'Bold'] }],
        },
      ],
    }
    const document = RichText.decodeDocument(raw)
    expect(Schema.encodeSync(RichText.Document)(document)).toEqual(raw)
    expect(RichText.findUnknownMarks(document)).toEqual([{ node: 't', mark: 'Highlight' }])
  })

  it('reports only unknown marks, per text run', () => {
    expect(RichText.findUnknownMarks(loaded())).toEqual([{ node: 't', mark: 'Highlight' }])
    expect(
      RichText.findUnknownMarks(RichText.decodeDocument({ version: 1, children: [] })),
    ).toEqual([])
  })

  it('still rejects empty and duplicate marks', () => {
    for (const marks of [[''], ['Highlight', 'Highlight'], ['Bold', 'Bold']]) {
      expect(() =>
        RichText.decodeDocument({
          version: 1,
          children: [
            { type: 'Paragraph', id: 'p', children: [{ type: 'Text', id: 't', text: 'x', marks }] },
          ],
        }),
      ).toThrow()
    }
  })

  it('carries unknown marks through text edits and removes them by name', () => {
    const state = { document: loaded(), selection: null }
    const edited = success(
      RichText.apply(state, [
        RichText.Edit.insertText(RichText.Node.make('t').at(5, 'after'), '!'),
      ]),
    )
    expect(edited.state.document.children[0]?.children[0]?.marks).toEqual(['Bold', 'Highlight'])
    const cleaned = success(
      RichText.apply(edited.state, [
        RichText.Edit.removeMark(RichText.Node.make('t'), 'Highlight'),
      ]),
    )
    expect(cleaned.state.document.children[0]?.children[0]?.marks).toEqual(['Bold'])
    expect(RichText.findUnknownMarks(cleaned.state.document)).toEqual([])
  })

  it('refuses to add unknown marks through either construction path', () => {
    expect(() =>
      // @ts-expect-error Unknown marks cannot be added.
      RichText.Edit.addMark(RichText.NodeId.make('t'), 'Highlight'),
    ).toThrow()
    expect(
      RichText.apply({ document: loaded(), selection: null }, [
        // @ts-expect-error Unknown marks cannot be added.
        { type: 'AddMark', node: RichText.NodeId.make('t'), mark: 'Highlight' },
      ]),
    ).toEqual({ ok: false, error: 'InvalidInput' })
  })
})
