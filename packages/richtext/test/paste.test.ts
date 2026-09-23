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

describe('pasting a slice', () => {
  it('splits the block mid-run and lands the content between the halves', () => {
    const result = paste(sliceOfText('XY'))
    expect(summary(result)).toEqual([
      { id: 'p', text: 'a' },
      { id: 'n1', text: 'XY' },
      { id: 'n4', text: 'bcd' },
      { id: 'q', text: 'ef' },
    ])
    expect(result.state.selection).toEqual(caret('n2', 2))
    expect(success(result).changeSet.structureChanged).toBe(true)
  })

  it('pastes above the block at its very start', () => {
    const result = paste(sliceOfText('XY'), caret('a', 0))
    expect(summary(result)).toEqual([
      { id: 'n1', text: 'XY' },
      { id: 'p', text: 'abcd' },
      { id: 'q', text: 'ef' },
    ])
    expect(result.state.selection).toEqual(caret('n2', 2))
  })

  it('pastes below the block at its very end', () => {
    const result = paste(sliceOfText('XY'), caret('b', 2))
    expect(summary(result)).toEqual([
      { id: 'p', text: 'abcd' },
      { id: 'n1', text: 'XY' },
      { id: 'q', text: 'ef' },
    ])
    expect(result.state.selection).toEqual(caret('n2', 2))
  })

  it('replaces a range before pasting', () => {
    const result = paste(sliceOfText('XY'), range(['a', 1], ['b', 1]))
    expect(summary(result)).toEqual([
      { id: 'p', text: 'a' },
      { id: 'n1', text: 'XY' },
      { id: 'n4', text: 'd' },
      { id: 'q', text: 'ef' },
    ])
    expect(result.state.selection).toEqual(caret('n2', 2))
  })

  it('keeps multi-block content in order with fresh identities', () => {
    const result = paste(sliceOfText('one\ntwo\nthree'), caret('c', 1))
    expect(summary(result)).toEqual([
      { id: 'p', text: 'abcd' },
      { id: 'q', text: 'e' },
      { id: 'n1', text: 'one' },
      { id: 'n3', text: 'two' },
      { id: 'n5', text: 'three' },
      { id: 'n8', text: 'f' },
    ])
    expect(result.state.selection).toEqual(caret('n6', 5))
  })

  it('keeps marks and block types from a copied slice', () => {
    const copied = RichText.sliceOf(document(), range(['b', 0], ['c', 2]))!
    const result = paste(copied, caret('a', 1))
    expect(summary(result)).toEqual([
      { id: 'p', text: 'a' },
      { id: 'n1', text: 'cd' },
      { id: 'n3', text: 'ef' },
      { id: 'n6', text: 'bcd' },
      { id: 'q', text: 'ef' },
    ])
    const pasted = success(result).state.document.children
    expect(pasted[1]?.children[0]?.marks).toEqual(['Bold'])
    expect(pasted[2]?.type).toBe('Paragraph')
    expect(result.state.selection).toEqual(caret('n4', 2))
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

  it('lands the caret on what follows when the content ends without text', () => {
    const empty = RichText.sliceOf(
      RichText.decodeDocument({
        version: 1,
        children: [{ type: 'Paragraph', id: 'p2', children: [] }],
      }),
      { type: 'Node', node: id('p2') },
    )!
    const result = paste(empty, caret('a', 1))
    expect(summary(result)).toEqual([
      { id: 'p', text: 'a' },
      { id: 'n1', text: '' },
      { id: 'n3', text: 'bcd' },
      { id: 'q', text: 'ef' },
    ])
    // The trailing half the split created, not the block before the paste.
    expect(result.state.selection).toEqual(caret('n2', 0))
  })
})
