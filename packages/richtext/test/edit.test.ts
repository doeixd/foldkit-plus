import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const Text = RichText.Node.make('t')
const Other = RichText.Node.make('other')

const initial = (): RichText.EditorState => ({
  document: RichText.decodeDocument({
    version: 1,
    children: [
      {
        type: 'Paragraph',
        id: 'p',
        children: [
          { type: 'Text', id: 't', text: 'abcd', marks: ['Bold'] },
          { type: 'Text', id: 'other', text: 'unchanged', marks: [] },
        ],
      },
    ],
  }),
  selection: null,
})
const success = (result: RichText.TransactionResult) => {
  if (!result.ok) throw new Error(result.error)
  return result
}

describe('Edit constructors', () => {
  it('builds the documented wire shape for every operation', () => {
    expect(RichText.Edit.insertText(Text.at(1, 'after'), 'x')).toEqual({
      type: 'InsertText',
      at: { node: 't', offset: 1, affinity: 'after' },
      text: 'x',
    })
    expect(RichText.Edit.deleteText(Text, 1, 3)).toEqual({
      type: 'DeleteText',
      node: 't',
      from: 1,
      to: 3,
    })
    expect(RichText.Edit.addMark(Text, 'Italic')).toEqual({
      type: 'AddMark',
      node: 't',
      mark: 'Italic',
    })
    expect(RichText.Edit.removeMark(Text, 'Bold')).toEqual({
      type: 'RemoveMark',
      node: 't',
      mark: 'Bold',
    })
    expect(RichText.Edit.setSelection(null)).toEqual({ type: 'SetSelection', selection: null })
  })

  it('accepts raw ids and references interchangeably', () => {
    const id = RichText.NodeId.make('t')
    expect(RichText.Edit.addMark(id, 'Italic')).toEqual(RichText.Edit.addMark(Text, 'Italic'))
    expect(RichText.Edit.removeMark(id, 'Bold')).toEqual(RichText.Edit.removeMark(Text, 'Bold'))
    expect(RichText.Edit.deleteText(id, 0, 1)).toEqual(RichText.Edit.deleteText(Text, 0, 1))
  })

  it('composes a multi-edit transaction from references alone', () => {
    const result = success(
      RichText.apply(initial(), [
        RichText.Edit.setSelection({
          type: 'Range',
          anchor: Text.at(0, 'before'),
          focus: Text.at(1, 'after'),
        }),
        RichText.Edit.insertText(Text.at(0, 'after'), 'XY'),
        RichText.Edit.addMark(Other, 'Bold'),
        RichText.Edit.removeMark(Text, 'Bold'),
        RichText.Edit.deleteText(Other, 0, 2),
      ]),
    )
    expect(result.state.document.children[0]?.children[0]).toEqual({
      type: 'Text',
      id: 't',
      text: 'XYabcd',
      marks: [],
    })
    expect(result.state.document.children[0]?.children[1]).toEqual({
      type: 'Text',
      id: 'other',
      text: 'changed',
      marks: ['Bold'],
    })
    expect(result.state.selection).toEqual({
      type: 'Range',
      anchor: Text.at(0, 'before'),
      focus: Text.at(3, 'after'),
    })
  })

  it('throws at construction for malformed shapes', () => {
    expect(() => RichText.Edit.deleteText(Text, 3, 2)).toThrow()
    expect(() => RichText.Edit.deleteText(Text, -1, 2)).toThrow()
    expect(() => RichText.Edit.deleteText(Text, 0.5, 1)).toThrow()
    expect(() => RichText.Edit.addMark(Text, { name: '' })).toThrow()
    expect(() =>
      // @ts-expect-error A text target is required.
      RichText.Edit.addMark(42, 'Bold'),
    ).toThrow()
  })

  it('leaves document checks to apply', () => {
    const Paragraph = RichText.Node.make('p')
    expect(RichText.apply(initial(), [RichText.Edit.addMark(Paragraph, 'Bold')])).toEqual({
      ok: false,
      error: 'MissingText',
    })
  })
})
