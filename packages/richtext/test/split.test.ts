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
          { type: 'Text', id: 't', text: 'abcd', marks: ['Bold'] },
          { type: 'Text', id: 'u', text: 'ef', marks: [] },
        ],
      },
      {
        type: 'Heading',
        id: 'h',
        level: 2,
        children: [{ type: 'Text', id: 'v', text: 'Hi', marks: [] }],
      },
    ],
  }),
  selection: null,
})
const success = (result: RichText.TransactionResult) => {
  if (!result.ok) throw new Error(result.error)
  return result
}

describe('split blocks', () => {
  it('splits a run, keeping the left identity and inheriting marks right', () => {
    const state = initial()
    const result = success(
      RichText.apply(state, [RichText.Edit.splitBlock(id('p'), id('t'), 2, 'p2', 't2')]),
    )
    expect(result.state.document.children).toHaveLength(3)
    expect(result.state.document.children[0]).toEqual({
      type: 'Paragraph',
      id: 'p',
      children: [{ type: 'Text', id: 't', text: 'ab', marks: ['Bold'] }],
    })
    expect(result.state.document.children[1]).toEqual({
      type: 'Paragraph',
      id: 'p2',
      children: [
        { type: 'Text', id: 't2', text: 'cd', marks: ['Bold'] },
        { type: 'Text', id: 'u', text: 'ef', marks: [] },
      ],
    })
    expect(result.state.document.children[2]).toBe(state.document.children[1])
    expect(state.document.children[0]?.children[0]?.text).toBe('abcd')
    expect(result.positionMap).toEqual([{ node: 't', into: 't2', at: 2 }])
    expect(result.changeSet).toEqual({
      dirtyNodes: new Set(['p', 'p2', 't', 't2', 'u']),
      insertedNodes: new Set(['p2', 't2']),
      removedNodes: new Set(),
      textChanged: new Set(['t', 't2']),
      structureChanged: true,
      selectionChanged: false,
    })
  })

  it.each([
    ['start', 0, '', 'abcd'],
    ['end', 4, 'abcd', ''],
  ] as const)('splits at the %s without losing text', (_label, offset, left, right) => {
    const result = success(
      RichText.apply(initial(), [RichText.Edit.splitBlock(id('p'), id('t'), offset, 'p2', 't2')]),
    )
    expect(result.state.document.children[0]?.children[0]?.text).toBe(left)
    expect(result.state.document.children[1]?.children[0]?.text).toBe(right)
    expect(result.changeSet.structureChanged).toBe(true)
  })

  it('keeps heading levels on the new block', () => {
    const result = success(
      RichText.apply(initial(), [RichText.Edit.splitBlock(id('h'), id('v'), 1, 'h2', 'v2')]),
    )
    expect(result.state.document.children[2]).toEqual({
      type: 'Heading',
      id: 'h2',
      level: 2,
      children: [{ type: 'Text', id: 'v2', text: 'i', marks: [] }],
    })
  })

  it('maps selections through the split, preserving direction', () => {
    const state: RichText.EditorState = {
      ...initial(),
      selection: { type: 'Range', anchor: position('t', 3), focus: position('t', 1, 'before') },
    }
    const result = success(
      RichText.apply(state, [RichText.Edit.splitBlock(id('p'), id('t'), 2, 'p2', 't2')]),
    )
    expect(result.state.selection).toEqual({
      type: 'Range',
      anchor: position('t2', 1),
      focus: position('t', 1, 'before'),
    })
    expect(result.changeSet.selectionChanged).toBe(true)
  })

  it.each([
    [2, 'before', 't', 2],
    [2, 'after', 't2', 0],
    [0, 'before', 't', 0],
    [4, 'after', 't2', 2],
  ] as const)('maps a point at offset %s with %s affinity', (offset, affinity, node, expected) => {
    expect(
      RichText.mapPosition(position('t', offset, affinity), [
        { node: id('t'), into: id('t2'), at: 2 },
      ]),
    ).toEqual(position(node, expected, affinity))
  })

  it('leaves other nodes and node selections alone', () => {
    const other = position('u', 1)
    expect(RichText.mapPosition(other, [{ node: id('t'), into: id('t2'), at: 2 }])).toBe(other)
    const state: RichText.EditorState = {
      ...initial(),
      selection: { type: 'Node', node: id('h') },
    }
    const result = success(
      RichText.apply(state, [RichText.Edit.splitBlock(id('p'), id('t'), 2, 'p2', 't2')]),
    )
    expect(result.state.selection).toEqual({ type: 'Node', node: id('h') })
    expect(result.changeSet.selectionChanged).toBe(false)
  })

  it('supports follow-up edits against the new structure in one transaction', () => {
    const result = success(
      RichText.apply(initial(), [
        RichText.Edit.splitBlock(id('p'), id('t'), 2, 'p2', 't2'),
        RichText.Edit.insertText(RichText.Node.make('t2').at(0, 'after'), 'XY'),
        RichText.Edit.splitBlock(id('p2'), id('t2'), 3, 'p3', 't3'),
      ]),
    )
    expect(result.state.document.children.map(block => block.id)).toEqual(['p', 'p2', 'p3', 'h'])
    expect(result.state.document.children[1]?.children[0]).toEqual({
      type: 'Text',
      id: 't2',
      text: 'XYc',
      marks: ['Bold'],
    })
    expect(result.state.document.children[2]?.children[0]).toEqual({
      type: 'Text',
      id: 't3',
      text: 'd',
      marks: ['Bold'],
    })
    expect(result.positionMap).toHaveLength(3)
  })

  it('builds the documented wire shape and validates new ids at construction', () => {
    expect(RichText.Edit.splitBlock(id('p'), id('t'), 2, 'p2', 't2')).toEqual({
      type: 'SplitNode',
      block: 'p',
      node: 't',
      offset: 2,
      blockId: 'p2',
      textId: 't2',
    })
    expect(
      RichText.Edit.splitBlock(
        RichText.Node.make('p'),
        RichText.Node.make('t'),
        2,
        id('p2'),
        id('t2'),
      ),
    ).toEqual(RichText.Edit.splitBlock(id('p'), id('t'), 2, 'p2', 't2'))
    expect(() => RichText.Edit.splitBlock(id('p'), id('t'), 2, '', 't2')).toThrow()
    expect(() => RichText.Edit.splitBlock(id('p'), id('t'), -1, 'p2', 't2')).toThrow()
    expect(() =>
      // @ts-expect-error Offsets are numbers.
      RichText.Edit.splitBlock(id('p'), id('t'), '2', 'p2', 't2'),
    ).toThrow()
  })

  it.each([
    [
      {
        type: 'SplitNode',
        block: id('missing'),
        node: id('t'),
        offset: 0,
        blockId: id('p2'),
        textId: id('t2'),
      },
      'MissingNode',
    ],
    [
      {
        type: 'SplitNode',
        block: id('p'),
        node: id('missing'),
        offset: 0,
        blockId: id('p2'),
        textId: id('t2'),
      },
      'MissingText',
    ],
    [
      {
        type: 'SplitNode',
        block: id('h'),
        node: id('t'),
        offset: 0,
        blockId: id('p2'),
        textId: id('t2'),
      },
      'InvalidRange',
    ],
    [
      {
        type: 'SplitNode',
        block: id('p'),
        node: id('t'),
        offset: 99,
        blockId: id('p2'),
        textId: id('t2'),
      },
      'InvalidRange',
    ],
    [
      {
        type: 'SplitNode',
        block: id('p'),
        node: id('t'),
        offset: 0,
        blockId: id('p'),
        textId: id('t2'),
      },
      'InvalidInput',
    ],
    [
      {
        type: 'SplitNode',
        block: id('p'),
        node: id('t'),
        offset: 0,
        blockId: id('p2'),
        textId: id('t'),
      },
      'InvalidInput',
    ],
    [
      {
        type: 'SplitNode',
        block: id('p'),
        node: id('t'),
        offset: 0,
        blockId: id('x'),
        textId: id('x'),
      },
      'InvalidInput',
    ],
  ] satisfies ReadonlyArray<readonly [RichText.Operation, string]>)(
    'rejects atomically: %j',
    (operation, error) => {
      const state = initial()
      const result = RichText.apply(state, [
        RichText.Edit.insertText(RichText.Node.make('t').at(0, 'after'), '!'),
        operation,
      ])
      expect(result).toEqual({ ok: false, error })
      expect(state.document.children).toHaveLength(2)
      expect(state.document.children[0]?.children[0]?.text).toBe('abcd')
    },
  )
})
