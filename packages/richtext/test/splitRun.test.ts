import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const id = RichText.NodeId.make
const position = (
  node: string,
  offset: number,
  affinity: 'before' | 'after' = 'after',
): RichText.Position => ({ node: id(node), offset, affinity })
const initial = (): RichText.EditorState => ({
  document: RichText.decodeDocument({
    version: 1,
    children: [
      {
        type: 'Paragraph',
        id: 'p',
        children: [{ type: 'Text', id: 't', text: 'abcd', marks: [] }],
      },
    ],
  }),
  selection: null,
})
const success = (result: RichText.TransactionResult) => {
  if (!result.ok) throw new Error(result.error)
  return result
}

describe('split runs', () => {
  it('splits a run into left and right halves with a fresh identity', () => {
    const state = initial()
    const result = success(
      RichText.apply(state, [
        RichText.Edit.splitRun(id('t'), 2, 't2'),
        RichText.Edit.addMark(id('t2'), 'Bold'),
      ]),
    )
    expect(result.state.document.children[0]?.children).toEqual([
      { type: 'Text', id: 't', text: 'ab', marks: [] },
      { type: 'Text', id: 't2', text: 'cd', marks: ['Bold'] },
    ])
    expect(state.document.children[0]?.children).toHaveLength(1)
    expect(result.changeSet.insertedNodes).toEqual(new Set(['t2']))
    expect(result.changeSet.structureChanged).toBe(false)
    expect(result.positionMap).toEqual([{ node: 't', into: 't2', at: 2 }])
  })

  it('normalizes a bare split back into one run', () => {
    const state = initial()
    const result = success(RichText.apply(state, [RichText.Edit.splitRun(id('t'), 2, 't2')]))
    expect(result.state.document.children[0]?.children).toEqual([
      { type: 'Text', id: 't', text: 'abcd', marks: [] },
    ])
    expect(result.changeSet.removedNodes).toEqual(new Set(['t2']))
    expect(result.changeSet.insertedNodes).toEqual(new Set(['t2']))
  })

  it('maps selections through the split, preserving affinity at the boundary', () => {
    const state: RichText.EditorState = {
      ...initial(),
      selection: { type: 'Range', anchor: position('t', 4), focus: position('t', 2, 'before') },
    }
    const result = success(
      RichText.apply(state, [
        RichText.Edit.splitRun(id('t'), 2, 't2'),
        RichText.Edit.addMark(id('t2'), 'Bold'),
      ]),
    )
    expect(result.state.selection).toEqual({
      type: 'Range',
      anchor: position('t2', 2),
      focus: position('t', 2, 'before'),
    })
  })

  it.each([
    [2, 'before', 't', 2],
    [2, 'after', 't2', 0],
    [1, 'after', 't', 1],
    [4, 'after', 't2', 2],
  ] as const)('maps a point at offset %s with %s affinity', (offset, affinity, node, expected) => {
    expect(
      RichText.mapPosition(position('t', offset, affinity), [
        { node: id('t'), into: id('t2'), at: 2 },
      ]),
    ).toEqual(position(node, expected, affinity))
  })

  it('treats splitting at zero as a no-op', () => {
    const state = initial()
    const result = success(RichText.apply(state, [RichText.Edit.splitRun(id('t'), 0, 't2')]))
    expect(result.state).toBe(state)
    expect(result.positionMap).toEqual([])
    expect(result.changeSet.insertedNodes).toEqual(new Set())
  })

  it('builds the documented wire shape from ids or references', () => {
    expect(RichText.Edit.splitRun(id('t'), 2, 't2')).toEqual({
      type: 'SplitRun',
      node: 't',
      offset: 2,
      textId: 't2',
    })
    expect(RichText.Edit.splitRun(RichText.Node.make('t'), 2, id('t2'))).toEqual(
      RichText.Edit.splitRun(id('t'), 2, 't2'),
    )
    expect(() => RichText.Edit.splitRun(id('t'), 2, '')).toThrow()
  })

  it.each([
    [{ type: 'SplitRun', node: id('missing'), offset: 1, textId: id('t2') }, 'MissingText'],
    [{ type: 'SplitRun', node: id('t'), offset: 9, textId: id('t2') }, 'InvalidRange'],
    [{ type: 'SplitRun', node: id('t'), offset: 1, textId: id('t') }, 'InvalidInput'],
  ] satisfies ReadonlyArray<readonly [RichText.Operation, string]>)(
    'rejects atomically: %j',
    (operation, error) => {
      const state = initial()
      const result = RichText.apply(state, [
        RichText.Edit.insertText(RichText.Node.make('t').at(0, 'after'), '!'),
        operation,
      ])
      expect(result).toEqual({ ok: false, error })
      expect(state.document.children[0]?.children[0]?.text).toBe('abcd')
    },
  )
})
