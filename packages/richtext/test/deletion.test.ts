import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

/**
 * Regressions from the implementation review: structural deletion across a
 * paragraph boundary, and deletion that never splits a character.
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
const ids = { mint: () => 'new' }
const success = (result: RichText.TransactionResult) => {
  if (!result.ok) throw new Error(result.error)
  return result
}
const run = (state: RichText.EditorState, command: RichText.Command) =>
  RichText.run(state, command, ids)

describe('deleting a range across a paragraph boundary', () => {
  const twoParagraphs = (): RichText.EditorState => ({
    document: RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Paragraph',
          id: 'p1',
          children: [{ type: 'Text', id: 'a', text: 'abc', marks: [] }],
        },
        {
          type: 'Paragraph',
          id: 'p2',
          children: [{ type: 'Text', id: 'b', text: 'def', marks: [] }],
        },
      ],
    }),
    selection: null,
  })

  it('joins the paragraphs the selection spanned', () => {
    // The review's case: from offset 1 of `abc` to offset 1 of `def`.
    const withSelection: RichText.EditorState = {
      ...twoParagraphs(),
      selection: range(['a', 1], ['b', 1]),
    }
    const deleted = success(run(withSelection, { type: 'DeleteBackward' }))
    expect(deleted.state.document.children).toHaveLength(1)
    expect(deleted.state.document.children[0]?.children[0]?.text).toBe('aef')
    expect(deleted.state.selection).toEqual(caret('a', 1))
  })

  it('deletes a range covering only the boundary', () => {
    const boundary: RichText.EditorState = {
      ...twoParagraphs(),
      selection: range(['a', 3], ['b', 0]),
    }
    const result = success(run(boundary, { type: 'DeleteBackward' }))
    expect(result.state.document.children).toHaveLength(1)
    expect(result.state.document.children[0]?.children[0]?.text).toBe('abcdef')
  })

  it('replaces a cross-paragraph selection with typed text as one paragraph', () => {
    const selected: RichText.EditorState = {
      ...twoParagraphs(),
      selection: range(['a', 1], ['b', 2]),
    }
    const result = success(run(selected, { type: 'InsertText', text: 'X' }))
    expect(result.state.document.children).toHaveLength(1)
    expect(result.state.document.children[0]?.children[0]?.text).toBe('aXf')
  })

  it('keeps the block kinds it joins and normalizes what matches', () => {
    const mixed: RichText.EditorState = {
      document: RichText.decodeDocument({
        version: 1,
        children: [
          {
            type: 'Paragraph',
            id: 'p1',
            children: [{ type: 'Text', id: 'a', text: 'ab', marks: [] }],
          },
          {
            type: 'Paragraph',
            id: 'p2',
            children: [{ type: 'Text', id: 'b', text: 'cd', marks: ['Bold'] }],
          },
        ],
      }),
      selection: range(['a', 1], ['b', 1]),
    }
    const result = success(run(mixed, { type: 'DeleteBackward' }))
    expect(result.state.document.children).toHaveLength(1)
    // Both remainders keep their marks, so they do not merge into one run.
    expect(result.state.document.children[0]?.children.map(run => [run.text, run.marks])).toEqual([
      ['a', []],
      ['d', ['Bold']],
    ])
  })

  it('removes many crossed blocks in one range without losing the tail', () => {
    const blocks = Array.from({ length: 120 }, (_, index) => ({
      type: 'Paragraph' as const,
      id: `p${index}`,
      children: [{ type: 'Text' as const, id: `t${index}`, text: 'abc', marks: [] }],
    }))
    const state: RichText.EditorState = {
      document: RichText.decodeDocument({ version: 1, children: blocks }),
      selection: range(['t10', 1], ['t109', 2]),
    }
    const result = success(run(state, { type: 'DeleteBackward' }))
    expect(result.state.document.children.map(block => block.id)).toEqual([
      ...blocks.slice(0, 10).map(block => block.id),
      'p10',
      ...blocks.slice(110).map(block => block.id),
    ])
    expect(result.state.document.children[10]?.children.map(run => run.text).join('')).toBe('ac')
    expect(result.changeSet.removedNodes.size).toBeGreaterThanOrEqual(99)
  })
})

describe('deletion never splits a character', () => {
  const text = (value: string, selection: RichText.Selection): RichText.EditorState => ({
    document: RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Paragraph',
          id: 'p',
          children: [{ type: 'Text', id: 't', text: value, marks: [] }],
        },
      ],
    }),
    selection,
  })

  it.each([
    ['an emoji', 'ab🌱', 4, 'ab'],
    ['an emoji mid-text', 'a🌱b', 3, 'ab'],
    ['a combining mark', 'e\u0301x', 2, 'x'],
    ['an accented supplementary character', '😀\u0301x', 3, 'x'],
    ['a joined emoji', '👩‍💻x', 5, 'x'],
  ])('removes %s whole when deleting backward', (_label, value, offset, expected) => {
    const result = success(run(text(value, caret('t', offset)), { type: 'DeleteBackward' }))
    expect(result.state.document.children[0]?.children[0]?.text).toBe(expected)
    expect(result.state.selection).toEqual(caret('t', offset - (value.length - expected.length)))
  })

  it.each([
    ['an emoji', '🌱ab', 0, 'ab'],
    ['a combining mark', '\u0301ex', 0, 'ex'],
    ['an accented supplementary character', '😀\u0301x', 0, 'x'],
    ['a joined emoji', '👩‍💻x', 0, 'x'],
  ])('removes %s whole when deleting forward', (_label, value, offset, expected) => {
    const result = success(run(text(value, caret('t', offset)), { type: 'DeleteForward' }))
    expect(result.state.document.children[0]?.children[0]?.text).toBe(expected)
  })

  it('removes a whole grapheme when stepping back into the neighbor run', () => {
    const state: RichText.EditorState = {
      document: RichText.decodeDocument({
        version: 1,
        children: [
          {
            type: 'Paragraph',
            id: 'p',
            children: [
              { type: 'Text', id: 'a', text: 'x🌱', marks: [] },
              { type: 'Text', id: 'b', text: 'cd', marks: [] },
            ],
          },
        ],
      }),
      selection: caret('b', 0),
    }
    const result = success(run(state, { type: 'DeleteBackward' }))
    // The emoji went whole, and the equal-mark runs then merged as usual.
    expect(result.state.document.children[0]?.children.map(run => run.text)).toEqual(['xcd'])
    expect(result.state.document.children[0]?.children[0]?.text).not.toMatch(/[\uD800-\uDFFF]/u)
    expect(result.state.selection).toEqual(caret('a', 1))
  })

  it.each(['DeleteBackward', 'DeleteForward'] as const)(
    'removes one grapheme split across styled runs with %s',
    type => {
      const state: RichText.EditorState = {
        document: RichText.decodeDocument({
          version: 1,
          children: [
            {
              type: 'Paragraph',
              id: 'p',
              children: [
                { type: 'Text', id: 'a', text: '👩', marks: [] },
                { type: 'Text', id: 'b', text: '‍', marks: ['Bold'] },
                { type: 'Text', id: 'c', text: '💻x', marks: [] },
              ],
            },
          ],
        }),
        selection: type === 'DeleteBackward' ? caret('c', 2) : caret('a', 0),
      }
      const result = success(run(state, { type }))
      expect(result.state.document.children[0]?.children.map(run => run.text).join('')).toBe('x')
      expect(RichText.decodeDocument(result.state.document)).toEqual(result.state.document)
    },
  )
})
