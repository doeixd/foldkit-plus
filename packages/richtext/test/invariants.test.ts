import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

/**
 * Regressions from the implementation review: an invariant that a successful
 * transaction is a valid input for the next one, and the mark-name boundary.
 */
const id = RichText.NodeId.make
const at = (node: string, offset: number): RichText.Position => ({
  node: id(node),
  offset,
  affinity: 'after',
})

describe('a successful transaction is a valid input', () => {
  const mergeable = () =>
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

  it('relocates a node selection whose run normalization retires', () => {
    const state: RichText.EditorState = {
      document: mergeable(),
      selection: { type: 'Node', node: id('b') },
    }
    const result = RichText.apply(state, [RichText.Edit.removeMark(id('b'), 'Bold')])
    if (!result.ok) throw new Error(result.error)
    // `b` merged into `a`, so the selection follows it rather than dangling.
    expect(result.changeSet.removedNodes.has(id('b'))).toBe(true)
    expect(result.state.selection).toEqual({ type: 'Node', node: id('a') })
    expect(RichText.selectionIsValid(result.state.document, result.state.selection)).toBe(true)
    // The point of the invariant: the next transaction is accepted.
    const next = RichText.apply(result.state, [
      RichText.Edit.insertText(RichText.Node.make('a').at(0, 'after'), '!'),
    ])
    expect(next.ok).toBe(true)
  })

  it('keeps a range selection valid when a whole run retires', () => {
    const state: RichText.EditorState = {
      document: mergeable(),
      selection: { type: 'Range', anchor: at('b', 1), focus: at('b', 0) },
    }
    const result = RichText.apply(state, [RichText.Edit.removeMark(id('b'), 'Bold')])
    if (!result.ok) throw new Error(result.error)
    expect(result.state.selection).toEqual({
      type: 'Range',
      anchor: { node: id('a'), offset: 3, affinity: 'after' },
      focus: { node: id('a'), offset: 2, affinity: 'after' },
    })
    expect(RichText.selectionIsValid(result.state.document, result.state.selection)).toBe(true)
  })

  it('clears a node selection when nothing survives to address', () => {
    const single = RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Paragraph',
          id: 'p',
          children: [{ type: 'Text', id: 'a', text: 'ab', marks: [] }],
        },
      ],
    })
    const result = RichText.apply(
      { document: single, selection: { type: 'Node', node: id('p') } },
      [RichText.Edit.deleteBlock(id('p'))],
    )
    if (!result.ok) throw new Error(result.error)
    expect(result.state.selection).toBeNull()
    expect(RichText.selectionIsValid(result.state.document, result.state.selection)).toBe(true)
  })
})

describe('the mark-name boundary', () => {
  it.each(['toString', 'constructor', '__proto__', 'hasOwnProperty'])(
    'refuses the prototype name %s as a mark',
    name => {
      expect(RichText.shippedRegistry.declares(name)).toBe(false)
      const state: RichText.EditorState = {
        document: RichText.decodeDocument({
          version: 1,
          children: [
            {
              type: 'Paragraph',
              id: 'p',
              children: [{ type: 'Text', id: 'a', text: 'ab', marks: [] }],
            },
          ],
        }),
        selection: { type: 'Range', anchor: at('a', 0), focus: at('a', 2) },
      }
      // A diagnostic, not a throw: the boundary refuses rather than crashing.
      expect(
        RichText.run(state, { type: 'ToggleMark', mark: name }, { mint: () => 'new' }),
      ).toEqual({ ok: false, error: 'InvalidInput' })
    },
  )
})
