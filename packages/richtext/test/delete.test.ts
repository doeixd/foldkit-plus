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
        children: [{ type: 'Text', id: 't', text: 'ab', marks: [] }],
      },
      {
        type: 'Paragraph',
        id: 'p2',
        children: [{ type: 'Text', id: 'v', text: 'cd', marks: ['Bold'] }],
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

describe('delete blocks', () => {
  it('collapses positions to the block now at the removed index', () => {
    const state: RichText.EditorState = {
      ...initial(),
      selection: { type: 'Range', anchor: position('t', 2), focus: position('t', 0, 'before') },
    }
    const result = success(RichText.apply(state, [RichText.Edit.deleteBlock(id('p'))]))
    expect(result.state.document.children.map(block => block.id)).toEqual(['p2', 'h'])
    expect(result.state.selection).toEqual({
      type: 'Range',
      anchor: position('v', 0),
      focus: position('v', 0, 'before'),
    })
    expect(result.positionMap).toEqual([{ node: 't', into: 'v' }])
    expect(result.changeSet).toEqual({
      dirtyNodes: new Set(['p', 't']),
      insertedNodes: new Set(),
      removedNodes: new Set(['p', 't']),
      textChanged: new Set(),
      structureChanged: true,
      selectionChanged: true,
    })
  })

  it('wraps to the document start when deleting the last block', () => {
    const state: RichText.EditorState = {
      ...initial(),
      selection: { type: 'Range', anchor: position('v', 1), focus: position('v', 1) },
    }
    const result = success(RichText.apply(state, [RichText.Edit.deleteBlock(id('p2'))]))
    expect(result.state.document.children.map(block => block.id)).toEqual(['p', 'h'])
    expect(result.state.selection).toEqual({
      type: 'Range',
      anchor: position('t', 0),
      focus: position('t', 0),
    })
    expect(result.positionMap).toEqual([{ node: 'v', into: 't' }])
  })

  it('clears selection when no text remains and remaps node selections', () => {
    const single: RichText.EditorState = {
      document: RichText.decodeDocument({
        version: 1,
        children: [
          {
            type: 'Paragraph',
            id: 'p',
            children: [{ type: 'Text', id: 't', text: 'ab', marks: [] }],
          },
        ],
      }),
      selection: { type: 'Range', anchor: position('t', 1), focus: position('t', 0) },
    }
    const cleared = success(RichText.apply(single, [RichText.Edit.deleteBlock(id('p'))]))
    expect(cleared.state.document.children).toEqual([])
    expect(cleared.state.selection).toBeNull()
    expect(cleared.positionMap).toEqual([])
    expect(cleared.changeSet.selectionChanged).toBe(true)

    const onBlock: RichText.EditorState = {
      ...initial(),
      selection: { type: 'Node', node: id('p') },
    }
    const remapped = success(RichText.apply(onBlock, [RichText.Edit.deleteBlock(id('p'))]))
    expect(remapped.state.selection).toEqual({ type: 'Node', node: id('p2') })

    const onRun: RichText.EditorState = {
      ...initial(),
      selection: { type: 'Node', node: id('t') },
    }
    const runRemapped = success(RichText.apply(onRun, [RichText.Edit.deleteBlock(id('p'))]))
    expect(runRemapped.state.selection).toEqual({ type: 'Node', node: id('p2') })

    const elsewhere: RichText.EditorState = {
      ...initial(),
      selection: { type: 'Node', node: id('h') },
    }
    const kept = success(RichText.apply(elsewhere, [RichText.Edit.deleteBlock(id('p'))]))
    expect(kept.state.selection).toEqual({ type: 'Node', node: id('h') })
    expect(kept.changeSet.selectionChanged).toBe(false)
  })

  it('maps external positions through collapse steps', () => {
    const step: RichText.CollapseStep = { node: id('t'), into: id('v') }
    expect(RichText.mapPosition(position('t', 2), [step])).toEqual(position('v', 0))
    expect(RichText.mapPosition(position('t', 0, 'before'), [step])).toEqual(
      position('v', 0, 'before'),
    )
    const other = position('u', 1)
    expect(RichText.mapPosition(other, [step])).toBe(other)
  })

  it('supports follow-up edits after deletion in one transaction', () => {
    const result = success(
      RichText.apply(initial(), [
        RichText.Edit.deleteBlock(id('p')),
        RichText.Edit.insertText(RichText.Node.make('v').at(0, 'after'), 'XY'),
      ]),
    )
    expect(result.state.document.children.map(block => block.id)).toEqual(['p2', 'h'])
    expect(result.state.document.children[0]?.children[0]?.text).toBe('XYcd')
    expect(result.positionMap).toHaveLength(2)
  })

  it('builds the documented wire shape from ids or references', () => {
    expect(RichText.Edit.deleteBlock(id('p'))).toEqual({ type: 'DeleteNode', node: 'p' })
    expect(RichText.Edit.deleteBlock(RichText.Node.make('p'))).toEqual(
      RichText.Edit.deleteBlock(id('p')),
    )
  })

  it.each([[{ type: 'DeleteNode', node: id('missing') }, 'MissingNode']] satisfies ReadonlyArray<
    readonly [RichText.Operation, string]
  >)('rejects atomically: %j', (operation, error) => {
    const state = initial()
    const result = RichText.apply(state, [
      RichText.Edit.insertText(RichText.Node.make('t').at(0, 'after'), '!'),
      operation,
    ])
    expect(result).toEqual({ ok: false, error })
    expect(state.document.children).toHaveLength(3)
    expect(state.document.children[0]?.children[0]?.text).toBe('ab')
  })
})
