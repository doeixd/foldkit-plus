import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const id = RichText.NodeId.make
const position = (
  node: string,
  offset: number,
  affinity: 'before' | 'after' = 'after',
): RichText.Position => ({
  node: id(node),
  offset,
  affinity,
})
const initial = (): RichText.EditorState => ({
  document: RichText.decodeDocument({
    version: 1,
    children: [
      {
        type: 'Paragraph',
        id: 'p',
        children: [
          { type: 'Text', id: 't', text: 'ab', marks: ['Bold'] },
          { type: 'Text', id: 'u', text: 'cd', marks: [] },
        ],
      },
      {
        type: 'Paragraph',
        id: 'p2',
        children: [{ type: 'Text', id: 'v', text: 'ef', marks: ['Italic'] }],
      },
      { type: 'Heading', id: 'h', level: 1, children: [] },
    ],
  }),
  selection: null,
})
const success = (result: RichText.TransactionResult) => {
  if (!result.ok) throw new Error(result.error)
  return result
}

describe('join blocks', () => {
  it('moves runs without merging, keeping every identity and mark', () => {
    const state = initial()
    const result = success(RichText.apply(state, [RichText.Edit.joinBlocks(id('p'), id('p2'))]))
    expect(result.state.document.children).toHaveLength(2)
    expect(result.state.document.children[0]).toEqual({
      type: 'Paragraph',
      id: 'p',
      children: [
        { type: 'Text', id: 't', text: 'ab', marks: ['Bold'] },
        { type: 'Text', id: 'u', text: 'cd', marks: [] },
        { type: 'Text', id: 'v', text: 'ef', marks: ['Italic'] },
      ],
    })
    expect(result.state.document.children[1]).toBe(state.document.children[2])
    expect(state.document.children).toHaveLength(3)
    expect(result.positionMap).toEqual([])
    expect(result.changeSet).toEqual({
      dirtyNodes: new Set(['p', 'p2', 'v']),
      insertedNodes: new Set(),
      removedNodes: new Set(['p2']),
      textChanged: new Set(),
      structureChanged: true,
      selectionChanged: false,
    })
  })

  it('leaves range selections untouched and remaps node selections off the removed block', () => {
    const ranged: RichText.EditorState = {
      ...initial(),
      selection: { type: 'Range', anchor: position('v', 2), focus: position('t', 0, 'before') },
    }
    const kept = success(RichText.apply(ranged, [RichText.Edit.joinBlocks(id('p'), id('p2'))]))
    expect(kept.state.selection).toEqual(ranged.selection)
    expect(kept.changeSet.selectionChanged).toBe(false)

    const onRemoved: RichText.EditorState = {
      ...initial(),
      selection: { type: 'Node', node: id('p2') },
    }
    const remapped = success(
      RichText.apply(onRemoved, [RichText.Edit.joinBlocks(id('p'), id('p2'))]),
    )
    expect(remapped.state.selection).toEqual({ type: 'Node', node: id('p') })
    expect(remapped.changeSet.selectionChanged).toBe(true)

    const onSurvivor: RichText.EditorState = {
      ...initial(),
      selection: { type: 'Node', node: id('p') },
    }
    const untouched = success(
      RichText.apply(onSurvivor, [RichText.Edit.joinBlocks(id('p'), id('p2'))]),
    )
    expect(untouched.state.selection).toEqual({ type: 'Node', node: id('p') })
    expect(untouched.changeSet.selectionChanged).toBe(false)
  })

  it('keeps the survivor type and handles empty blocks uniformly', () => {
    const headed: RichText.EditorState = {
      document: RichText.decodeDocument({
        version: 1,
        children: [
          {
            type: 'Heading',
            id: 'h',
            level: 3,
            children: [{ type: 'Text', id: 'v', text: 'Hi', marks: [] }],
          },
          {
            type: 'Paragraph',
            id: 'p',
            children: [{ type: 'Text', id: 't', text: 'bye', marks: ['Bold'] }],
          },
        ],
      }),
      selection: null,
    }
    const intoHeading = success(
      RichText.apply(headed, [RichText.Edit.joinBlocks(id('h'), id('p'))]),
    )
    expect(intoHeading.state.document.children).toHaveLength(1)
    expect(intoHeading.state.document.children[0]).toEqual({
      type: 'Heading',
      id: 'h',
      level: 3,
      children: [
        { type: 'Text', id: 'v', text: 'Hi', marks: [] },
        { type: 'Text', id: 't', text: 'bye', marks: ['Bold'] },
      ],
    })

    const emptyRemoved = success(
      RichText.apply(initial(), [RichText.Edit.joinBlocks(id('p2'), id('h'))]),
    )
    expect(emptyRemoved.state.document.children.map(block => block.id)).toEqual(['p', 'p2'])
    expect(emptyRemoved.changeSet.removedNodes).toEqual(new Set(['h']))
    expect(emptyRemoved.changeSet.textChanged).toEqual(new Set())
  })

  it('round-trips split then join, proving fresh indexes mid-transaction', () => {
    const result = success(
      RichText.apply(initial(), [
        RichText.Edit.splitBlock(id('p'), id('t'), 1, 'px', 'tx'),
        RichText.Edit.joinBlocks(id('p'), id('px')),
        RichText.Edit.insertText(RichText.Node.make('v').at(2, 'after'), '!'),
      ]),
    )
    expect(result.state.document.children.map(block => block.id)).toEqual(['p', 'p2', 'h'])
    expect(result.state.document.children[0]?.children).toEqual([
      { type: 'Text', id: 't', text: 'a', marks: ['Bold'] },
      { type: 'Text', id: 'tx', text: 'b', marks: ['Bold'] },
      { type: 'Text', id: 'u', text: 'cd', marks: [] },
    ])
    expect(result.state.document.children[1]?.children[0]).toEqual({
      type: 'Text',
      id: 'v',
      text: 'ef!',
      marks: ['Italic'],
    })
    expect(result.changeSet.structureChanged).toBe(true)
    expect(result.changeSet.removedNodes).toEqual(new Set(['px']))
  })

  it('builds the documented wire shape from ids or references', () => {
    expect(RichText.Edit.joinBlocks(id('p'), id('p2'))).toEqual({
      type: 'JoinNode',
      into: 'p',
      removed: 'p2',
    })
    expect(RichText.Edit.joinBlocks(RichText.Node.make('p'), RichText.Node.make('p2'))).toEqual(
      RichText.Edit.joinBlocks(id('p'), id('p2')),
    )
  })

  it.each([
    [{ type: 'JoinNode', into: id('missing'), removed: id('p2') }, 'MissingNode'],
    [{ type: 'JoinNode', into: id('p'), removed: id('missing') }, 'MissingNode'],
    [{ type: 'JoinNode', into: id('p'), removed: id('h') }, 'InvalidRange'],
    [{ type: 'JoinNode', into: id('p2'), removed: id('p') }, 'InvalidRange'],
    [{ type: 'JoinNode', into: id('p'), removed: id('p') }, 'InvalidRange'],
  ] satisfies ReadonlyArray<readonly [RichText.Operation, string]>)(
    'rejects atomically: %j',
    (operation, error) => {
      const state = initial()
      const result = RichText.apply(state, [
        RichText.Edit.insertText(RichText.Node.make('t').at(0, 'after'), '!'),
        operation,
      ])
      expect(result).toEqual({ ok: false, error })
      expect(state.document.children).toHaveLength(3)
      expect(state.document.children[0]?.children[0]?.text).toBe('ab')
    },
  )
})
