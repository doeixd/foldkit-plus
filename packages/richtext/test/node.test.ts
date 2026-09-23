import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const Text = RichText.Node.make('text-1')
const Paragraph = RichText.Node.make('paragraph-1')
const document = RichText.Document.make({
  version: 1,
  children: [
    RichText.Paragraph.make({
      type: 'Paragraph',
      id: Paragraph.id,
      children: [
        RichText.Text.make({
          type: 'Text',
          id: RichText.NodeId.make('decoy'),
          text: 'other',
          marks: ['Bold'],
        }),
        RichText.Text.make({ type: 'Text', id: Text.id, text: 'Hello', marks: [] }),
      ],
    }),
  ],
})

describe('node references', () => {
  it('validates the identity once and keeps it immutable', () => {
    const ref = RichText.Node.make('__proto__')
    expect(ref.id).toBe('__proto__')
    expect(Reflect.set(ref, 'id', RichText.NodeId.make('changed'))).toBe(false)
    expect(ref.at(0, 'before').node).toBe('__proto__')
    expect(() => RichText.Node.make('')).toThrow()
  })

  it('reads current content by identity across edits, snapshots, and missing nodes', () => {
    expect(Text.read(document)?.type).toBe('Text')
    expect(Paragraph.read(document)).toBe(document.children[0])
    const result = RichText.apply({ document, selection: null }, [
      { type: 'InsertText', at: Text.at(5, 'after'), text: '!' },
    ])
    if (!result.ok) throw new Error(result.error)
    expect(Text.read(result.state.document)).toEqual({
      type: 'Text',
      id: Text.id,
      text: 'Hello!',
      marks: [],
    })
    expect(Text.read(document)).toEqual({ type: 'Text', id: Text.id, text: 'Hello', marks: [] })
    expect(Text.read(RichText.Document.make({ version: 1, children: [] }))).toBeUndefined()
    expect(RichText.Node.make('text-1').read(result.state.document)).toBe(
      Text.read(result.state.document),
    )
  })

  it('describes positions while leaving existence and text bounds to the transaction', () => {
    expect(Text.at(2, 'before')).toEqual({ node: Text.id, offset: 2, affinity: 'before' })
    expect(Text.at(2, 'after')).toEqual({ node: Text.id, offset: 2, affinity: 'after' })
    for (const at of [Paragraph.at(0, 'after'), RichText.Node.make('missing').at(0, 'after')]) {
      expect(
        RichText.apply({ document, selection: null }, [{ type: 'InsertText', at, text: 'x' }]),
      ).toEqual({ ok: false, error: 'MissingText' })
    }
    expect(
      RichText.apply({ document, selection: null }, [
        { type: 'InsertText', at: Text.at(100, 'after'), text: 'x' },
      ]),
    ).toEqual({ ok: false, error: 'InvalidRange' })
  })

  it.each([-1, 0.5, NaN, Infinity])('rejects invalid offset %s at construction', offset => {
    expect(() => Text.at(offset, 'after')).toThrow()
  })
})
