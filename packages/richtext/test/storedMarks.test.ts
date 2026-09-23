import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

/**
 * Stored marks: the marks a caret carries, so the next typed text lands with
 * exactly them (richtext-DESIGN §26).
 */
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
const success = (result: RichText.TransactionResult) => {
  if (!result.ok) throw new Error(result.error)
  return result
}
const runsOf = (current: RichText.EditorState) =>
  current.document.children[0]?.children.map(run => [run.text, run.marks] as const)

describe('typing with stored marks', () => {
  it('gives the inserted text exactly the stored set', () => {
    const result = success(
      RichText.run(
        state(caret('a', 1)),
        { type: 'InsertText', text: 'X', marks: ['Italic'] },
        minted(),
      ),
    )
    expect(runsOf(result.state)).toEqual([
      ['a', []],
      ['X', ['Italic']],
      ['b', []],
      ['cd', ['Bold']],
    ])
    // The caret sits after what was typed: the start of the run that follows it.
    expect(result.state.selection).toEqual({
      type: 'Range',
      anchor: { node: id('n1'), offset: 0, affinity: 'after' },
      focus: { node: id('n1'), offset: 0, affinity: 'after' },
    })
  })

  it('removes the marks a stored set does not name', () => {
    const result = success(
      RichText.run(state(caret('b', 1)), { type: 'InsertText', text: 'X', marks: [] }, minted()),
    )
    expect(runsOf(result.state)).toEqual([
      ['ab', []],
      ['c', ['Bold']],
      ['X', []],
      ['d', ['Bold']],
    ])
  })

  it('types at the end of a run without leaving an empty remainder', () => {
    const result = success(
      RichText.run(
        state(caret('a', 2)),
        { type: 'InsertText', text: 'X', marks: ['Bold'] },
        minted(),
      ),
    )
    // The typed run carries Bold, which is what the next run already carries,
    // so normalization merges them — the text is what matters here.
    expect(runsOf(result.state)).toEqual([
      ['ab', []],
      ['Xcd', ['Bold']],
    ])
  })

  it('replaces a range and marks the replacement', () => {
    const result = success(
      RichText.run(
        state(range(['a', 1], ['b', 1])),
        { type: 'InsertText', text: 'X', marks: ['Italic'] },
        minted(),
      ),
    )
    expect(runsOf(result.state)).toEqual([
      ['a', []],
      ['X', ['Italic']],
      ['d', ['Bold']],
    ])
  })

  it('keeps the text a same-run range left after the replacement', () => {
    const result = success(
      RichText.run(
        state(range(['a', 0], ['a', 1])),
        { type: 'InsertText', text: 'X', marks: ['Italic'] },
        minted(),
      ),
    )
    expect(runsOf(result.state)).toEqual([
      ['X', ['Italic']],
      ['b', []],
      ['cd', ['Bold']],
    ])
  })

  it('leaves no empty run when the range takes the run tail with it', () => {
    const result = success(
      RichText.run(
        state(range(['a', 1], ['a', 2])),
        { type: 'InsertText', text: 'X', marks: ['Italic'] },
        minted(),
      ),
    )
    expect(runsOf(result.state)).toEqual([
      ['a', []],
      ['X', ['Italic']],
      ['cd', ['Bold']],
    ])
  })

  it('leaves the boundary rule alone when no marks are given', () => {
    // Typing after bold still continues bold.
    const result = success(
      RichText.run(state(caret('b', 2)), { type: 'InsertText', text: 'X' }, minted()),
    )
    expect(runsOf(result.state)).toEqual([
      ['ab', []],
      ['cdX', ['Bold']],
    ])
  })

  it('refuses a stored mark this vocabulary does not define', () => {
    expect(
      RichText.run(
        state(caret('a', 1)),
        { type: 'InsertText', text: 'X', marks: ['Link'] },
        minted(),
      ),
    ).toEqual({ ok: false, error: 'InvalidInput' })
  })

  it('takes several stored marks at once, in a stable order', () => {
    const result = success(
      RichText.run(
        state(caret('a', 1)),
        { type: 'InsertText', text: 'X', marks: ['Italic', 'Bold'] },
        minted(),
      ),
    )
    expect(runsOf(result.state)?.[1]).toEqual(['X', ['Italic', 'Bold']])
  })
})
