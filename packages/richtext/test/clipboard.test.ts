import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const id = RichText.NodeId.make
const at = (node: string, offset: number): RichText.Position => ({
  node: id(node),
  offset,
  affinity: 'after',
})
const range = (
  anchor: readonly [string, number],
  focus: readonly [string, number],
): RichText.Selection => ({
  type: 'Range',
  anchor: at(anchor[0], anchor[1]),
  focus: at(focus[0], focus[1]),
})
const document = () =>
  RichText.decodeDocument({
    version: 1,
    children: [
      {
        type: 'Paragraph',
        id: 'p',
        children: [
          { type: 'Text', id: 'a', text: 'ab', marks: [] },
          { type: 'Text', id: 'b', text: 'cd', marks: ['Bold'] },
        ],
      },
      {
        type: 'Heading',
        id: 'h',
        level: 2,
        children: [{ type: 'Text', id: 'c', text: 'Title', marks: [] }],
      },
      { type: 'Paragraph', id: 'q', children: [{ type: 'Text', id: 'd', text: 'ef', marks: [] }] },
    ],
  })
const minted = () => {
  let count = 0
  return () => `c${++count}`
}

describe('copying a slice', () => {
  it('trims a range inside one run and keeps its marks', () => {
    const slice = RichText.sliceOf(document(), range(['b', 0], ['b', 2]))!
    expect(slice.blocks).toEqual([
      {
        type: 'Paragraph',
        id: 'p',
        children: [{ type: 'Text', id: 'b', text: 'cd', marks: ['Bold'] }],
      },
    ])
    expect(RichText.plainTextOf(slice)).toBe('cd')
  })

  it('takes only the covered part of each touched block, in document order', () => {
    const slice = RichText.sliceOf(document(), range(['b', 1], ['c', 3]))!
    expect(slice.blocks).toEqual([
      {
        type: 'Paragraph',
        id: 'p',
        children: [{ type: 'Text', id: 'b', text: 'd', marks: ['Bold'] }],
      },
      {
        type: 'Heading',
        id: 'h',
        level: 2,
        children: [{ type: 'Text', id: 'c', text: 'Tit', marks: [] }],
      },
    ])
    expect(RichText.plainTextOf(slice)).toBe('d\nTit')
  })

  it('normalizes a backwards range to document order', () => {
    const slice = RichText.sliceOf(document(), range(['c', 3], ['b', 1]))!
    expect(RichText.plainTextOf(slice)).toBe('d\nTit')
  })

  it('takes a whole block for a node selection, including an unknown one', () => {
    const heading = RichText.sliceOf(document(), { type: 'Node', node: id('h') })!
    expect(RichText.plainTextOf(heading)).toBe('Title')
    const withUnknown = RichText.decodeDocument({
      version: 1,
      children: [{ type: 'Embed', id: 'e', src: 'x' }],
    })
    const slice = RichText.sliceOf(withUnknown, { type: 'Node', node: id('e') })!
    expect(RichText.plainTextOf(slice)).toBe('[Embed]')
  })

  it('reports nothing to copy for a null or unresolvable selection', () => {
    expect(RichText.sliceOf(document(), null)).toBeUndefined()
    expect(RichText.sliceOf(document(), { type: 'Node', node: id('missing') })).toBeUndefined()
    expect(RichText.sliceOf(document(), range(['missing', 0], ['a', 1]))).toBeUndefined()
  })

  it('takes a whole-block range without dragging in untouched blocks', () => {
    const slice = RichText.sliceOf(document(), range(['a', 0], ['b', 2]))!
    expect(slice.blocks.map(block => block.id)).toEqual(['p'])
    expect(RichText.plainTextOf(slice)).toBe('abcd')
  })
})

describe('slice identity', () => {
  it('remaps every identity so two pastes cannot collide', () => {
    const slice = RichText.sliceOf(document(), { type: 'Node', node: id('p') })!
    const first = RichText.withFreshIds(slice, minted())
    const second = RichText.withFreshIds(slice, minted())
    expect(first.blocks[0]?.id).toBe('c1')
    expect(first.blocks[0]?.children.map(run => run.id)).toEqual(['c2', 'c3'])
    expect(second.blocks[0]?.id).toBe('c1')
    expect(RichText.plainTextOf(first)).toBe('abcd')
    expect(first.blocks[0]?.children[1]?.marks).toEqual(['Bold'])
  })

  it('builds paragraphs from pasted plain text, one per line', () => {
    const slice = RichText.sliceFromText('one\r\ntwo\n\nthree', minted())
    expect(slice.blocks).toHaveLength(4)
    expect(RichText.plainTextOf(slice)).toBe('one\ntwo\n\nthree')
    expect(slice.blocks.map(block => block.id)).toEqual(['c1', 'c3', 'c5', 'c7'])
  })
})

describe('slice encoding', () => {
  it('round-trips through its serialized form', () => {
    const slice = RichText.sliceOf(document(), range(['a', 1], ['c', 3]))!
    const encoded = RichText.serializeSlice(slice)
    expect(typeof encoded).toBe('string')
    expect(RichText.deserializeSlice(encoded)).toEqual(slice)
    expect(RichText.deserializeSlice(JSON.parse(encoded))).toEqual(slice)
  })

  it('refuses payloads it did not write instead of guessing', () => {
    for (const payload of [
      'not json',
      JSON.stringify({ version: 2, blocks: [] }),
      JSON.stringify({ version: 1, blocks: [], extra: true }),
      JSON.stringify({
        version: 1,
        blocks: [{ type: 'Paragraph', id: 'x', children: [] }],
        note: 'x',
      }),
      JSON.stringify({
        version: 1,
        blocks: [
          {
            type: 'Paragraph',
            id: 'x',
            children: [{ type: 'Text', id: 'x', text: 'a', marks: [] }],
          },
        ],
      }),
      undefined,
      42,
    ]) {
      expect(RichText.deserializeSlice(payload)).toBeUndefined()
    }
  })

  it('accepts an empty slice and reports it as empty text', () => {
    expect(RichText.deserializeSlice(RichText.serializeSlice(RichText.emptySlice))).toEqual({
      version: 1,
      blocks: [],
    })
    expect(RichText.plainTextOf(RichText.emptySlice)).toBe('')
  })
})
