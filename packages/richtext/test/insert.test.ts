import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const id = RichText.NodeId.make
const paragraph = (blockId: string, runId: string, text: string) =>
  RichText.Paragraph.make({
    type: 'Paragraph',
    id: id(blockId),
    children: [RichText.Text.make({ type: 'Text', id: id(runId), text, marks: [] })],
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
      { type: 'Heading', id: 'h', level: 1, children: [] },
    ],
  }),
  selection: null,
})
const success = (result: RichText.TransactionResult) => {
  if (!result.ok) throw new Error(result.error)
  return result
}

describe('insert blocks', () => {
  it.each([
    ['start', 0, ['n', 'p', 'h']],
    ['middle', 1, ['p', 'n', 'h']],
    ['end', 2, ['p', 'h', 'n']],
  ] as const)('inserts %s preserving neighbors by reference', (_label, at, order) => {
    const state = initial()
    const result = success(
      RichText.apply(state, [RichText.Edit.insertBlock(paragraph('n', 'nt', 'new'), at)]),
    )
    expect(result.state.document.children.map(block => block.id)).toEqual(order)
    expect(result.state.document.children[at]).toEqual({
      type: 'Paragraph',
      id: 'n',
      children: [{ type: 'Text', id: 'nt', text: 'new', marks: [] }],
    })
    for (const original of state.document.children) {
      expect(result.state.document.children).toContain(original)
    }
    expect(state.document.children).toHaveLength(2)
    expect(result.positionMap).toEqual([])
    expect(result.changeSet).toEqual({
      dirtyNodes: new Set(['n', 'nt']),
      insertedNodes: new Set(['n', 'nt']),
      removedNodes: new Set(),
      textChanged: new Set(),
      structureChanged: true,
      selectionChanged: false,
    })
  })

  it('keeps neighbor blocks identical and supports follow-up edits', () => {
    const state = initial()
    const result = success(
      RichText.apply(state, [
        RichText.Edit.insertBlock(paragraph('n', 'nt', 'new'), 1),
        RichText.Edit.insertText(RichText.Node.make('nt').at(3, 'after'), '!'),
      ]),
    )
    expect(result.state.document.children.map(block => block.id)).toEqual(['p', 'n', 'h'])
    expect(result.state.document.children[0]).toBe(state.document.children[0])
    expect(result.state.document.children[2]).toBe(state.document.children[1])
    expect(result.state.document.children[1]?.children[0]?.text).toBe('new!')
  })

  it('accepts empty blocks', () => {
    const result = success(
      RichText.apply(initial(), [
        RichText.Edit.insertBlock(
          RichText.Paragraph.make({ type: 'Paragraph', id: id('n'), children: [] }),
          0,
        ),
      ]),
    )
    expect(result.state.document.children[0]).toEqual({ type: 'Paragraph', id: 'n', children: [] })
    expect(result.changeSet.insertedNodes).toEqual(new Set(['n']))
  })

  it('rejects out-of-range indexes at apply and malformed ones at construction', () => {
    const state = initial()
    expect(
      RichText.apply(state, [RichText.Edit.insertBlock(paragraph('n', 'nt', 'new'), 3)]),
    ).toEqual({ ok: false, error: 'InvalidRange' })
    expect(state.document.children).toHaveLength(2)
    for (const at of [-1, 0.5]) {
      expect(() => RichText.Edit.insertBlock(paragraph('n', 'nt', 'new'), at)).toThrow()
      expect(
        RichText.apply(state, [{ type: 'InsertNode', block: paragraph('n', 'nt', 'new'), at }]),
      ).toEqual({ ok: false, error: 'InvalidInput' })
    }
  })

  it.each([
    ['block id taken', paragraph('p', 'nt', 'new')],
    ['run id taken', paragraph('n', 't', 'new')],
    [
      'run ids collide',
      RichText.Paragraph.make({
        type: 'Paragraph',
        id: id('n'),
        children: [
          RichText.Text.make({ type: 'Text', id: id('x'), text: 'a', marks: [] }),
          RichText.Text.make({ type: 'Text', id: id('x'), text: 'b', marks: [] }),
        ],
      }),
    ],
  ])('rejects a reused identity: %s', (_label, block) => {
    const state = initial()
    expect(RichText.apply(state, [RichText.Edit.insertBlock(block, 1)])).toEqual({
      ok: false,
      error: 'InvalidInput',
    })
    expect(state.document.children).toHaveLength(2)
  })

  it('rejects unknown node types at the boundary', () => {
    expect(
      // @ts-expect-error Unknown nodes cannot be inserted.
      RichText.apply(initial(), [{ type: 'InsertNode', block: { type: 'Embed', id: 'x' }, at: 0 }]),
    ).toEqual({ ok: false, error: 'InvalidInput' })
  })
})
