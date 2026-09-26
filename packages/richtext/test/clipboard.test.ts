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

  it('normalizes a backwards range inside one run by its offsets', () => {
    const slice = RichText.sliceOf(document(), range(['c', 3], ['c', 1]))!
    expect(RichText.plainTextOf(slice)).toBe('it')
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

describe('copying from a nested block', () => {
  const nested = () =>
    RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Node',
          kind: 'List',
          id: 'list',
          props: {},
          children: [],
          blocks: [
            {
              type: 'Paragraph',
              id: 'li1',
              children: [{ type: 'Text', id: 'a', text: 'one', marks: [] }],
            },
            {
              type: 'Paragraph',
              id: 'li2',
              children: [{ type: 'Text', id: 'b', text: 'two', marks: ['Bold'] }],
            },
          ],
        },
        {
          type: 'Paragraph',
          id: 'tail',
          children: [{ type: 'Text', id: 't', text: 'tail', marks: [] }],
        },
      ],
    })
  const list = (slice: RichText.Slice) => {
    const block = slice.blocks[0]
    if (block?.type !== 'Node') throw new Error('expected a container')
    return block
  }

  it('trims a range inside one nested run', () => {
    const slice = RichText.sliceOf(nested(), range(['a', 1], ['a', 3]))!
    expect(slice.blocks.map(block => block.id)).toEqual(['li1'])
    expect(RichText.plainTextOf(slice)).toBe('ne')
  })

  it('takes a whole nested block for a node selection', () => {
    const slice = RichText.sliceOf(nested(), { type: 'Node', node: id('li2') })!
    expect(slice.blocks.map(block => block.id)).toEqual(['li2'])
    expect(RichText.plainTextOf(slice)).toBe('two')
  })

  it('carries the container when a range crosses its children', () => {
    const slice = RichText.sliceOf(nested(), range(['a', 1], ['b', 2]))!
    // The list survives as the wrapper, with both items trimmed to the range.
    expect(slice.blocks.map(block => block.id)).toEqual(['list'])
    expect(list(slice).blocks?.map(block => block.id)).toEqual(['li1', 'li2'])
    expect(list(slice).blocks?.[0]?.children[0]?.text).toBe('ne')
    expect(list(slice).blocks?.[1]?.children[0]?.text).toBe('tw')
    expect(list(slice).blocks?.[1]?.children[0]?.marks).toEqual(['Bold'])
    expect(RichText.plainTextOf(slice)).toBe('ne\ntw')
  })

  it('leaves a container out when the range never reaches it', () => {
    const slice = RichText.sliceOf(nested(), range(['t', 0], ['t', 4]))!
    expect(slice.blocks.map(block => block.id)).toEqual(['tail'])
    expect(RichText.plainTextOf(slice)).toBe('tail')
  })

  it('remints nested identities, so a paste cannot collide', () => {
    const slice = RichText.sliceOf(nested(), range(['a', 0], ['b', 3]))!
    const fresh = RichText.withFreshIds(slice, minted())
    // Pre-order: container, its runs (none), then each child and its runs.
    expect(list(fresh).id).toBe('c1')
    expect(list(fresh).blocks?.map(block => [block.id, block.children.map(run => run.id)])).toEqual(
      [
        ['c2', ['c3']],
        ['c4', ['c5']],
      ],
    )
    // Every identity differs from the source, and the slice still decodes.
    expect(RichText.deserializeSlice(RichText.serializeSlice(fresh))).toEqual(fresh)
    expect(RichText.plainTextOf(fresh)).toBe('one\ntwo')
  })

  it('refuses a slice whose nested identities collide', () => {
    expect(
      RichText.deserializeSlice(
        JSON.stringify({
          version: 1,
          blocks: [
            {
              type: 'Node',
              kind: 'List',
              id: 'l',
              props: {},
              children: [],
              blocks: [
                { type: 'Paragraph', id: 'x', children: [] },
                { type: 'Paragraph', id: 'x', children: [] },
              ],
            },
          ],
        }),
      ),
    ).toBeUndefined()
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
