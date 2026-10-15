import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const id = RichText.NodeId.make
const caret = (node: string, offset: number): RichText.Selection => ({
  type: 'Range',
  anchor: { node: id(node), offset, affinity: 'after' },
  focus: { node: id(node), offset, affinity: 'after' },
})
const range = (
  anchor: readonly [string, number],
  focus: readonly [string, number],
): RichText.Selection => ({
  type: 'Range',
  anchor: { node: id(anchor[0]), offset: anchor[1], affinity: 'after' },
  focus: { node: id(focus[0]), offset: focus[1], affinity: 'after' },
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
      { type: 'Paragraph', id: 'q', children: [{ type: 'Text', id: 'c', text: 'ef', marks: [] }] },
    ],
  })
const state = (selection: RichText.Selection | null): RichText.EditorState => ({
  document: document(),
  selection,
})
const minted = () => {
  let count = 0
  return { mint: () => `n${++count}` }
}
const paste = (slice: RichText.Slice, selection: RichText.Selection | null = caret('a', 1)) =>
  success(RichText.run(state(selection), { type: 'Paste', slice }, minted()))
type Success = Extract<RichText.TransactionResult, { readonly ok: true }>
const success = (result: RichText.TransactionResult): Success => {
  if (!result.ok) throw new Error(result.error)
  return result
}
const sliceOfText = (text: string, ids = minted()) => RichText.sliceFromText(text, ids.mint)
const summary = (result: Success) =>
  result.state.document.children.map(block => ({
    id: block.id,
    text: block.children.map(run => run.text).join(''),
  }))

/** The text before the caret, in its block: where writing goes on. */
const caretText = (result: Success) => {
  const selection = result.state.selection
  return selection?.type === 'Range'
    ? RichText.textBefore(result.state.document, selection.anchor)
    : undefined
}
const texts = (result: Success) => summary(result).map(block => block.text)

describe('pasting a slice', () => {
  it('joins a pasted line into the sentence at the caret', () => {
    const result = paste(sliceOfText('XY'))
    expect(summary(result)).toEqual([
      { id: 'p', text: 'aXYbcd' },
      { id: 'q', text: 'ef' },
    ])
    expect(caretText(result)).toBe('aXY')
    expect(success(result).changeSet.structureChanged).toBe(true)
  })

  it.each([
    ['start', caret('a', 0), 'XYabcd', 'XY'],
    ['end', caret('b', 2), 'abcdXY', 'abcdXY'],
  ] as const)('joins it at the block’s %s too', (_, at, text, before) => {
    const result = paste(sliceOfText('XY'), at)
    expect(texts(result)).toEqual([text, 'ef'])
    expect(caretText(result)).toBe(before)
  })

  it('replaces a range before pasting', () => {
    const result = paste(sliceOfText('XY'), range(['a', 1], ['b', 1]))
    expect(texts(result)).toEqual(['aXYd', 'ef'])
    expect(caretText(result)).toBe('aXY')
  })

  it('joins the first line to the text before and the last to the text after', () => {
    const result = paste(sliceOfText('one\ntwo\nthree'), caret('c', 1))
    expect(texts(result)).toEqual(['abcd', 'eone', 'two', 'threef'])
    expect(caretText(result)).toBe('three')
  })

  it('keeps marks and block types from a copied slice', () => {
    const copied = RichText.sliceOf(document(), range(['b', 0], ['c', 2]))!
    const result = paste(copied, caret('a', 1))
    expect(texts(result)).toEqual(['acd', 'efbcd', 'ef'])
    const [joined] = success(result).state.document.children
    expect(joined?.children.map(run => [run.text, run.marks])).toEqual([
      ['a', []],
      ['cd', ['Bold']],
    ])
    expect(caretText(result)).toBe('ef')
  })

  const image = () =>
    RichText.sliceOf(
      RichText.decodeDocument({
        version: 1,
        children: [{ type: 'Node', kind: 'Image', id: 'i', props: { src: 'x.png' }, children: [] }],
      }),
      { type: 'Node', node: id('i') },
    )!
  const kinds = (result: Success) =>
    result.state.document.children.map(block =>
      block.type === 'Node' ? block.kind : RichText.toText([block]),
    )

  it('lands a block that cannot join between the halves, the caret after it', () => {
    const result = paste(image(), caret('a', 1))
    expect(result.state.document.children.map(block => block.type)).toEqual([
      'Paragraph',
      'Node',
      'Paragraph',
      'Paragraph',
    ])
    expect(texts(result)).toEqual(['a', '', 'bcd', 'ef'])
    // At the start of the text after the image, the place to go on writing.
    expect(caretText(result)).toBe('')
    expect(result.state.selection).toMatchObject({ anchor: { offset: 0 } })
  })

  it('puts such a block above a line it is pasted at the start of, with no empty line', () => {
    expect(kinds(paste(image(), caret('a', 0)))).toEqual(['Image', 'abcd', 'ef'])
  })

  it('keeps an empty line after such a block pasted at a line’s end, to write on', () => {
    const result = paste(image(), caret('b', 2))
    expect(kinds(result)).toEqual(['abcd', 'Image', '', 'ef'])
    expect(caretText(result)).toBe('')
  })

  it('pastes into code as text, its lines and all', () => {
    const code: RichText.EditorState = {
      document: RichText.decodeDocument({
        version: 1,
        children: [
          {
            type: 'Node',
            kind: 'CodeBlock',
            id: 'code',
            props: {},
            children: [{ type: 'Text', id: 'k', text: 'ab', marks: [] }],
          },
        ],
      }),
      selection: caret('k', 1),
    }
    const result = success(
      RichText.run(code, { type: 'Paste', slice: sliceOfText('one\ntwo') }, minted(), {
        nodes: RichText.nodeRegistry(RichText.standardNodes),
      }),
    )
    expect(texts(result)).toEqual(['aone\ntwob'])
  })

  it('treats an empty slice as a no-op and refuses a node selection', () => {
    const before = state(caret('a', 1))
    expect(
      success(RichText.run(before, { type: 'Paste', slice: RichText.emptySlice }, minted())).state,
    ).toBe(before)
    expect(
      RichText.run(
        { ...before, selection: { type: 'Node', node: id('p') } },
        { type: 'Paste', slice: sliceOfText('X') },
        minted(),
      ),
    ).toEqual({ ok: false, error: 'InvalidSelection' })
    expect(
      RichText.run(
        { ...before, selection: null },
        { type: 'Paste', slice: sliceOfText('X') },
        minted(),
      ),
    ).toEqual({ ok: false, error: 'InvalidSelection' })
  })

  it('joins an empty pasted line away, leaving the caret where it was', () => {
    const empty = RichText.sliceOf(
      RichText.decodeDocument({
        version: 1,
        children: [{ type: 'Paragraph', id: 'p2', children: [] }],
      }),
      { type: 'Node', node: id('p2') },
    )!
    const result = paste(empty, caret('a', 1))
    expect(texts(result)).toEqual(['abcd', 'ef'])
    expect(caretText(result)).toBe('a')
  })
})
