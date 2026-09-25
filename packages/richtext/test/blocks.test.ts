import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const id = RichText.NodeId.make
const position = (node: string, offset: number): RichText.Position => ({
  node: id(node),
  offset,
  affinity: 'after',
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
      {
        type: 'Heading',
        id: 'h',
        level: 2,
        children: [{ type: 'Text', id: 'w', text: 'Hi', marks: [] }],
      },
    ],
  }),
  selection: null,
})
const success = (result: RichText.TransactionResult) => {
  if (!result.ok) throw new Error(result.error)
  return result
}

describe('move blocks', () => {
  it.each([
    ['first to last', 'p', 2, ['p2', 'h', 'p']],
    ['last to first', 'h', 0, ['h', 'p', 'p2']],
    ['middle up', 'p2', 0, ['p2', 'p', 'h']],
  ] as const)('moves %s preserving block values', (_label, node, to, order) => {
    const state = initial()
    const result = success(RichText.apply(state, [RichText.Edit.moveBlock(id(node), to)]))
    expect(result.state.document.children.map(block => block.id)).toEqual(order)
    for (const block of result.state.document.children) {
      const original = state.document.children.find(candidate => candidate.id === block.id)
      expect(block).toBe(original)
    }
    expect(result.positionMap).toEqual([])
    expect(result.changeSet).toEqual({
      dirtyNodes: new Set([node]),
      insertedNodes: new Set(),
      removedNodes: new Set(),
      textChanged: new Set(),
      structureChanged: true,
      selectionChanged: false,
    })
  })

  it('treats a move to the same index as a no-op', () => {
    const state = initial()
    const result = success(RichText.apply(state, [RichText.Edit.moveBlock(id('p2'), 1)]))
    expect(result.state).toBe(state)
    expect(result.positionMap).toEqual([])
    expect(result.changeSet.structureChanged).toBe(false)
  })

  it('keeps selections valid and reindexes later edits in one transaction', () => {
    const state: RichText.EditorState = {
      ...initial(),
      selection: { type: 'Range', anchor: position('v', 2), focus: position('t', 0) },
    }
    const result = success(
      RichText.apply(state, [
        RichText.Edit.moveBlock(id('p2'), 0),
        RichText.Edit.insertText(RichText.Node.make('v').at(2, 'after'), '!'),
      ]),
    )
    expect(result.state.document.children.map(block => block.id)).toEqual(['p2', 'p', 'h'])
    expect(result.state.document.children[0]?.children[0]?.text).toBe('cd!')
    expect(result.state.selection).toEqual({
      type: 'Range',
      anchor: position('v', 3),
      focus: position('t', 0),
    })
  })

  it('builds the documented wire shape from ids or references', () => {
    expect(RichText.Edit.moveBlock(id('p'), 2)).toEqual({ type: 'MoveNode', node: 'p', to: 2 })
    expect(RichText.Edit.moveBlock(RichText.Node.make('p'), 2)).toEqual(
      RichText.Edit.moveBlock(id('p'), 2),
    )
  })

  it.each([
    [{ type: 'MoveNode', node: id('missing'), to: 0 }, 'MissingNode'],
    [{ type: 'MoveNode', node: id('p'), to: 3 }, 'InvalidRange'],
    [{ type: 'MoveNode', node: id('p'), to: -1 }, 'InvalidInput'],
    [{ type: 'MoveNode', node: id('p'), to: 1.5 }, 'InvalidInput'],
  ] satisfies ReadonlyArray<readonly [RichText.Operation, string]>)(
    'rejects atomically: %j',
    (operation, error) => {
      const state = initial()
      const result = RichText.apply(state, [
        RichText.Edit.insertText(RichText.Node.make('t').at(0, 'after'), '!'),
        operation,
      ])
      expect(result).toEqual({ ok: false, error })
      expect(state.document.children.map(block => block.id)).toEqual(['p', 'p2', 'h'])
      expect(state.document.children[0]?.children[0]?.text).toBe('ab')
    },
  )
})

describe('retyping a text block', () => {
  it('retypes the heading while sharing run values', () => {
    const state = initial()
    const result = success(
      RichText.apply(state, [RichText.Edit.retypeBlock(id('h'), { type: 'Heading', level: 1 })]),
    )
    expect(result.state.document.children[2]).toEqual({
      type: 'Heading',
      id: 'h',
      level: 1,
      children: [{ type: 'Text', id: 'w', text: 'Hi', marks: [] }],
    })
    expect(result.state.document.children[2]?.children).toBe(state.document.children[2]?.children)
    expect(result.state.selection).toBeNull()
    expect(result.positionMap).toEqual([])
    expect(result.changeSet).toEqual({
      dirtyNodes: new Set(['h']),
      insertedNodes: new Set(),
      removedNodes: new Set(),
      textChanged: new Set(),
      structureChanged: true,
      selectionChanged: false,
    })
  })

  it('makes a paragraph of a heading, and a heading of a paragraph, keeping runs', () => {
    const state = initial()
    const paragraph = success(
      RichText.apply(state, [RichText.Edit.retypeBlock(id('h'), { type: 'Paragraph' })]),
    )
    expect(paragraph.state.document.children[2]).toEqual({
      type: 'Paragraph',
      id: 'h',
      children: [{ type: 'Text', id: 'w', text: 'Hi', marks: [] }],
    })
    const heading = success(
      RichText.apply(paragraph.state, [
        RichText.Edit.retypeBlock(id('h'), { type: 'Heading', level: 3 }),
      ]),
    )
    expect(heading.state.document.children[2]).toEqual({
      type: 'Heading',
      id: 'h',
      level: 3,
      children: [{ type: 'Text', id: 'w', text: 'Hi', marks: [] }],
    })
    // The paragraph kept the heading's run, and the heading kept the paragraph's.
    expect(heading.state.document.children[2]?.children[0]).toBe(
      paragraph.state.document.children[2]?.children[0],
    )
  })

  it('treats the same shape as a no-op preserving state identity', () => {
    const state = initial()
    const result = success(
      RichText.apply(state, [RichText.Edit.retypeBlock(id('h'), { type: 'Heading', level: 2 })]),
    )
    expect(result.state).toBe(state)
    expect(result.changeSet.structureChanged).toBe(false)
  })

  it('builds the documented wire shape from ids or references', () => {
    expect(RichText.Edit.retypeBlock(id('h'), { type: 'Heading', level: 3 })).toEqual({
      type: 'RetypeBlock',
      node: 'h',
      to: { type: 'Heading', level: 3 },
    })
    expect(RichText.Edit.retypeBlock(RichText.Node.make('h'), { type: 'Paragraph' })).toEqual(
      RichText.Edit.retypeBlock(id('h'), { type: 'Paragraph' }),
    )
  })

  it('rejects an unknown block atomically', () => {
    const state = initial()
    expect(
      RichText.apply(state, [
        { type: 'RetypeBlock', node: id('missing'), to: { type: 'Paragraph' } },
      ]),
    ).toEqual({ ok: false, error: 'MissingNode' })
    expect(state.document.children[2]).toEqual({
      type: 'Heading',
      id: 'h',
      level: 2,
      children: [{ type: 'Text', id: 'w', text: 'Hi', marks: [] }],
    })
  })

  it('refuses a block whose content is not runs', () => {
    const nested = RichText.decodeDocument({
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
              id: 'li',
              children: [{ type: 'Text', id: 'x', text: 'one', marks: [] }],
            },
          ],
        },
      ],
    })
    expect(
      RichText.apply({ document: nested, selection: null }, [
        RichText.Edit.retypeBlock(id('list'), { type: 'Paragraph' }),
      ]),
    ).toEqual({ ok: false, error: 'InvalidRange' })
  })

  it('rejects an out-of-vocabulary level at the boundary', () => {
    expect(
      RichText.apply(initial(), [
        // @ts-expect-error Deliberately invalid level.
        { type: 'RetypeBlock', node: id('h'), to: { type: 'Heading', level: 7 } },
      ]),
    ).toEqual({ ok: false, error: 'InvalidInput' })
  })
})
