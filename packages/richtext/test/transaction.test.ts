import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const id = RichText.NodeId.make
const position = (offset: number, affinity: 'before' | 'after' = 'after'): RichText.Position => ({
  node: id('t'),
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
          { type: 'Text', id: 'other', text: 'unchanged', marks: [] },
        ],
      },
      { type: 'Heading', id: 'h', level: 1, children: [] },
    ],
  }),
  selection: { type: 'Range', anchor: position(3), focus: position(1, 'before') },
})
const success = (result: RichText.TransactionResult) => {
  if (!result.ok) throw new Error(result.error)
  return result
}

describe('text transactions', () => {
  it('applies sequential edits and maps backward selections in the same transition', () => {
    const state = initial()
    const result = success(
      RichText.apply(state, [
        { type: 'InsertText', at: position(1), text: '🌱' },
        { type: 'DeleteText', node: id('t'), from: 3, to: 5 },
      ]),
    )
    expect(result.state.document.children[0]?.children[0]).toEqual({
      type: 'Text',
      id: 't',
      text: 'a🌱d',
      marks: ['Bold'],
    })
    expect(result.state.selection).toEqual({
      type: 'Range',
      anchor: position(3),
      focus: position(1, 'before'),
    })
    expect(result.positionMap).toEqual([
      { node: 't', from: 1, to: 1, inserted: 2 },
      { node: 't', from: 3, to: 5, inserted: 0 },
    ])
    expect(result.changeSet).toEqual({
      dirtyNodes: new Set(['p', 't']),
      textChanged: new Set(['t']),
      selectionChanged: false,
    })
    expect(result.state.document.children[1]).toBe(state.document.children[1])
    expect(result.state.document.children[0]?.children[1]).toBe(
      state.document.children[0]?.children[1],
    )
    expect(state.document.children[0]?.children[0]?.text).toBe('abcd')
  })

  it.each([
    [0, 'after', 0],
    [1, 'before', 1],
    [1, 'after', 3],
    [4, 'after', 6],
  ] as const)('maps insertion at offset %s with %s affinity', (offset, affinity, expected) => {
    expect(
      RichText.mapPosition(position(offset, affinity), [
        { node: id('t'), from: 1, to: 1, inserted: 2 },
      ]),
    ).toEqual(position(expected, affinity))
  })

  it.each([0, 1, 2, 3, 4])('maps deletion around offset %s', offset => {
    expect(
      RichText.mapPosition(position(offset), [{ node: id('t'), from: 1, to: 3, inserted: 0 }]),
    ).toEqual(position(offset < 1 ? offset : offset <= 3 ? 1 : 2))
  })

  it('leaves positions on other nodes unchanged and composes position steps', () => {
    const steps: ReadonlyArray<RichText.PositionStep> = [
      { node: id('t'), from: 1, to: 1, inserted: 2 },
      { node: id('t'), from: 0, to: 1, inserted: 0 },
    ]
    const other = { ...position(2), node: id('other') }
    expect(RichText.mapPosition(other, steps)).toEqual(other)
    expect(RichText.mapPosition(position(2), steps)).toEqual(position(3))
  })

  it('uses the current document for explicit selections and maps subsequent edits', () => {
    const result = success(
      RichText.apply(initial(), [
        { type: 'InsertText', at: position(4), text: '!' },
        {
          type: 'SetSelection',
          selection: { type: 'Range', anchor: position(5), focus: position(5) },
        },
        { type: 'DeleteText', node: id('t'), from: 0, to: 2 },
      ]),
    )
    expect(result.state.selection).toEqual({
      type: 'Range',
      anchor: position(3),
      focus: position(3),
    })
    expect(result.changeSet.selectionChanged).toBe(true)
  })

  it('preserves state identity for empty edits and unchanged selections', () => {
    const state = initial()
    const result = success(
      RichText.apply(state, [
        { type: 'InsertText', at: position(0), text: '' },
        { type: 'DeleteText', node: id('t'), from: 1, to: 1 },
        {
          type: 'SetSelection',
          selection: { type: 'Range', anchor: position(3), focus: position(1, 'before') },
        },
      ]),
    )
    expect(result.state).toBe(state)
    expect(result.positionMap).toEqual([])
    expect(result.changeSet).toEqual({
      dirtyNodes: new Set(),
      textChanged: new Set(),
      selectionChanged: false,
    })
  })

  it('changes node and null selections without dirtying content', () => {
    const selected = success(
      RichText.apply(initial(), [
        { type: 'SetSelection', selection: { type: 'Node', node: id('h') } },
      ]),
    )
    expect(selected.state.selection).toEqual({ type: 'Node', node: id('h') })
    const cleared = success(
      RichText.apply(selected.state, [{ type: 'SetSelection', selection: null }]),
    )
    expect(cleared.state.selection).toBeNull()
    expect(cleared.changeSet).toEqual({
      dirtyNodes: new Set(),
      textChanged: new Set(),
      selectionChanged: true,
    })
  })

  it.each([
    [{ type: 'InsertText', at: { ...position(0), node: id('missing') }, text: '!' }, 'MissingText'],
    [{ type: 'InsertText', at: position(99), text: '!' }, 'InvalidRange'],
    [{ type: 'DeleteText', node: id('t'), from: 3, to: 2 }, 'InvalidRange'],
    [{ type: 'DeleteText', node: id('t'), from: 0, to: 99 }, 'InvalidRange'],
    [{ type: 'InsertText', at: position(-1), text: '!' }, 'InvalidInput'],
    [{ type: 'InsertText', at: position(0.5), text: '!' }, 'InvalidInput'],
    [
      { type: 'SetSelection', selection: { type: 'Node', node: id('missing') } },
      'InvalidSelection',
    ],
  ] satisfies ReadonlyArray<readonly [RichText.Operation, string]>)(
    'rejects atomically: %j',
    (operation, error) => {
      const state = initial()
      const result = RichText.apply(state, [
        { type: 'InsertText', at: position(0), text: 'first edit' },
        operation,
      ])
      expect(result).toEqual({ ok: false, error })
      expect(state.document.children[0]?.children[0]?.text).toBe('abcd')
    },
  )

  it('validates incoming state and operation shapes at the boundary', () => {
    expect(
      RichText.apply({ ...initial(), selection: { type: 'Node', node: id('missing') } }, []),
    ).toEqual({ ok: false, error: 'InvalidInput' })
    // @ts-expect-error Deliberately invalid wire operation.
    expect(RichText.apply(initial(), [{ type: 'RunScript', code: 'alert(1)' }])).toEqual({
      ok: false,
      error: 'InvalidInput',
    })
  })
})
