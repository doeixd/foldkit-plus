import { describe, expect, it } from 'vitest'
import { Schema } from 'effect'
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

  it('leaves a collapsed selection unchanged when the inserted text is empty', () => {
    const before = state(caret('b', 0))
    const result = success(
      RichText.run(before, { type: 'InsertText', text: '', marks: [] }, minted()),
    )
    expect(result.state).toBe(before)
    expect(runsOf(result.state)).toEqual([
      ['ab', []],
      ['cd', ['Bold']],
    ])
  })

  it('deletes a selected range when its replacement text is empty', () => {
    const result = success(
      RichText.run(
        state(range(['b', 0], ['b', 1])),
        { type: 'InsertText', text: '', marks: [] },
        minted(),
      ),
    )
    expect(runsOf(result.state)).toEqual([
      ['ab', []],
      ['d', ['Bold']],
    ])
    expect(result.state.selection).toEqual(caret('b', 0))
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

  it('lands a stored mark that carries props, and replaces one already there', () => {
    const Link = RichText.mark('Link', { Props: Schema.Struct({ href: Schema.String }) })
    const ArticleKit = RichText.kit({ nodes: [], marks: [RichText.Bold, Link] })
    const registry = RichText.markRegistry(ArticleKit.marks)
    const typed = success(
      RichText.run(
        state(caret('a', 1)),
        { type: 'InsertText', text: 'X', marks: [Link.of({ href: '/docs' })] },
        minted(),
        { marks: registry },
      ),
    )
    expect(runsOf(typed.state)).toEqual([
      ['a', []],
      ['X', [{ name: 'Link', props: { href: '/docs' } }]],
      ['b', []],
      ['cd', ['Bold']],
    ])

    // Typing inside a bold run with a Link stored lands exactly the Link: the
    // stored set is the whole truth for the inserted span, not an addition.
    const relinked = success(
      RichText.run(
        state(caret('b', 1)),
        { type: 'InsertText', text: 'X', marks: [Link.of({ href: '/other' })] },
        minted(),
        { marks: registry },
      ),
    )
    expect(runsOf(relinked.state)).toEqual([
      ['ab', []],
      ['c', ['Bold']],
      ['X', [{ name: 'Link', props: { href: '/other' } }]],
      ['d', ['Bold']],
    ])
  })

  it('refuses a stored mark no registry declares, and accepts one a Kit declares', () => {
    expect(
      RichText.run(
        state(caret('a', 1)),
        { type: 'InsertText', text: 'X', marks: ['Link'] },
        minted(),
      ),
    ).toEqual({ ok: false, error: 'InvalidInput' })
    const Link = RichText.mark('Link', { Props: Schema.Struct({ href: Schema.String }) })
    const ArticleKit = RichText.kit({ nodes: [], marks: [RichText.Bold, Link] })
    const typed = success(
      RichText.run(
        state(caret('a', 1)),
        { type: 'InsertText', text: 'X', marks: [Link.of({ href: '/docs' })] },
        minted(),
        { marks: RichText.markRegistry(ArticleKit.marks) },
      ),
    )
    expect(runsOf(typed.state)?.[1]).toEqual(['X', [{ name: 'Link', props: { href: '/docs' } }]])
  })
})
