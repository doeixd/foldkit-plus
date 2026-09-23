import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const future = () => ({
  version: 1,
  children: [
    { type: 'Paragraph', id: 'p', children: [{ type: 'Text', id: 't', text: 'kept', marks: [] }] },
    {
      type: 'Embed',
      id: 'e',
      src: 'https://example.test/x',
      caption: { text: 'hi', nested: [1, 2, { deep: true }] },
    },
  ],
})
const success = (result: RichText.TransactionResult) => {
  if (!result.ok) throw new Error(result.error)
  return result
}

describe('unknown blocks', () => {
  it('preserves type, fields, and nested payload verbatim', () => {
    const document = RichText.decodeDocument(future())
    expect(document.children[1]).toEqual({
      type: 'Unknown',
      id: 'e',
      originalType: 'Embed',
      props: {
        src: 'https://example.test/x',
        caption: { text: 'hi', nested: [1, 2, { deep: true }] },
      },
      children: [],
    })
    expect(RichText.findUnknownNodes(document)).toEqual([{ node: 'e', originalType: 'Embed' }])
    expect(document.children[0]).toEqual({
      type: 'Paragraph',
      id: 'p',
      children: [{ type: 'Text', id: 't', text: 'kept', marks: [] }],
    })
  })

  it('round-trips the preserved form and keeps known nodes exact', () => {
    const document = RichText.decodeDocument(future())
    const encoded = Schema.encodeSync(RichText.Document)(document)
    expect(encoded.children[1]).toEqual(document.children[1])
    expect(RichText.decodeDocument(encoded)).toEqual(document)
  })

  it('reports unknown marks and nodes together as publishing blockers', () => {
    const document = RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Paragraph',
          id: 'p',
          children: [{ type: 'Text', id: 't', text: 'x', marks: ['Highlight'] }],
        },
        { type: 'Poll', id: 'q', options: ['a'] },
      ],
    })
    expect(RichText.findUnknownMarks(document)).toEqual([{ node: 't', mark: 'Highlight' }])
    expect(RichText.findUnknownNodes(document)).toEqual([{ node: 'q', originalType: 'Poll' }])
  })

  it('rejects payloads that are not JSON-safe instead of dropping them', () => {
    expect(() =>
      RichText.decodeDocument({
        version: 1,
        children: [{ type: 'Embed', id: 'e', load: () => 'nope' }],
      }),
    ).toThrow()
  })

  it('rejects malformed unknown blocks and unknown top-level fields', () => {
    expect(() => RichText.decodeDocument({ version: 1, children: [{ type: 'Embed' }] })).toThrow()
    expect(() =>
      RichText.decodeDocument({ version: 1, children: [{ type: 'Embed', id: '' }] }),
    ).toThrow()
    expect(() => RichText.decodeDocument({ version: 1, children: [], extra: 1 })).toThrow()
  })

  it('is addressable structurally but not text-editable', () => {
    const document = RichText.decodeDocument(future())
    const moved = success(
      RichText.apply({ document, selection: null }, [
        RichText.Edit.moveBlock(RichText.Node.make('e'), 0),
      ]),
    )
    expect(moved.state.document.children.map(block => block.id)).toEqual(['e', 'p'])
    expect(moved.changeSet.structureChanged).toBe(true)

    const deleted = success(
      RichText.apply({ document, selection: null }, [
        RichText.Edit.deleteBlock(RichText.Node.make('e')),
      ]),
    )
    expect(deleted.state.document.children.map(block => block.id)).toEqual(['p'])
    expect(deleted.changeSet.removedNodes).toEqual(new Set(['e']))

    expect(
      RichText.apply({ document, selection: null }, [
        RichText.Edit.insertText(RichText.Node.make('e').at(0, 'after'), '!'),
      ]),
    ).toEqual({ ok: false, error: 'MissingText' })
  })

  it('still rejects an unsupported document version', () => {
    expect(() => RichText.decodeDocument({ version: 2, children: [] })).toThrow()
  })
})
