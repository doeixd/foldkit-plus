/**
 * Search highlights (§64): a document's text found as decorations, and the block-offset read
 * every producer of ranges needs. Nothing here changes the document.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const id = RichText.NodeId.make

const document = () =>
  RichText.decodeDocument({
    version: 1,
    children: [
      {
        type: 'Paragraph',
        id: 'p',
        children: [
          { type: 'Text', id: 'a', text: 'ab', marks: [] },
          { type: 'Text', id: 'b', text: 'cd', marks: [] },
        ],
      },
      {
        type: 'Paragraph',
        id: 'q',
        children: [{ type: 'Text', id: 'c', text: 'abab', marks: [] }],
      },
      {
        type: 'Node',
        kind: 'Quote',
        id: 'quote',
        props: {},
        children: [],
        blocks: [
          {
            type: 'Paragraph',
            id: 'qp',
            children: [{ type: 'Text', id: 'n', text: 'hmm ab', marks: [] }],
          },
        ],
      },
    ],
  })

/** Each decoration as `[fromNode, fromOffset, toNode, toOffset]`, in document order. */
const spans = (query: string) =>
  RichText.searchDecorations(document(), query).map(decoration => [
    decoration.from.node,
    decoration.from.offset,
    decoration.to.node,
    decoration.to.offset,
  ])

describe('finding a document’s text as decorations', () => {
  it('is nothing for an empty query, and nothing when no text matches', () => {
    expect(RichText.searchDecorations(document(), '')).toEqual([])
    expect(RichText.searchDecorations(document(), 'zzz')).toEqual([])
  })

  it('finds every occurrence, one decoration each, in document order', () => {
    expect(spans('ab')).toEqual([
      ['a', 0, 'a', 2],
      ['c', 0, 'c', 2],
      ['c', 2, 'c', 4],
      ['n', 4, 'n', 6],
    ])
  })

  it('keeps a match that spans two runs as one decoration', () => {
    expect(spans('bc')).toEqual([['a', 1, 'b', 1]])
  })

  it('ends a run-boundary endpoint with `after` affinity, where a caret would sit', () => {
    const [first] = RichText.searchDecorations(document(), 'ab')
    expect(first?.from).toEqual({ node: id('a'), offset: 0, affinity: 'before' })
    expect(first?.to).toEqual({ node: id('a'), offset: 2, affinity: 'after' })
  })

  it('does not match across the boundary between two blocks', () => {
    // The blocks read `abcd` and `abab`: what a document has between blocks is structure,
    // so the `cd` that ends one and the `ab` that begins the next are not one match.
    expect(spans('cdab')).toEqual([])
  })

  it('is exact, so a different case is a different query', () => {
    expect(spans('AB')).toEqual([])
  })
})

describe('the position a block’s text offset addresses', () => {
  const block = () => document().children[0]!

  it('reads the run and the offset, and `after` at a run’s end', () => {
    expect(RichText.positionInBlock(block(), 1)).toEqual({
      node: id('a'),
      offset: 1,
      affinity: 'before',
    })
    expect(RichText.positionInBlock(block(), 2)).toEqual({
      node: id('a'),
      offset: 2,
      affinity: 'after',
    })
    expect(RichText.positionInBlock(block(), 3)).toEqual({
      node: id('b'),
      offset: 1,
      affinity: 'before',
    })
    expect(RichText.positionInBlock(block(), 4)).toEqual({
      node: id('b'),
      offset: 2,
      affinity: 'after',
    })
  })

  it('is nothing past the block’s end, or before its start', () => {
    expect(RichText.positionInBlock(block(), 5)).toBeUndefined()
    expect(RichText.positionInBlock(block(), -1)).toBeUndefined()
  })
})
