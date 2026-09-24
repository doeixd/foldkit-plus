/**
 * Editing inside nested blocks (§116 slice 1). Commands reach a run wherever it
 * sits; structural placement inside a container is refused with `InvalidParent`
 * until the addressing that lets a container's children move lands.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

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
const nested = () =>
  RichText.decodeDocument({
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
            id: 'li1',
            children: [{ type: 'Text', id: 'a', text: 'one', marks: [] }],
          },
          {
            type: 'Heading',
            id: 'li2',
            level: 2,
            children: [{ type: 'Text', id: 'b', text: 'two', marks: ['Bold'] }],
          },
        ],
      },
      {
        type: 'Paragraph',
        id: 'tail',
        children: [{ type: 'Text', id: 't', text: 'tail', marks: [] }],
      },
      {
        type: 'Paragraph',
        id: 'last',
        children: [{ type: 'Text', id: 'z', text: 'last', marks: [] }],
      },
    ],
  })
const state = (selection: RichText.Selection | null): RichText.EditorState => ({
  document: nested(),
  selection,
})
const minted = () => {
  let count = 0
  return { mint: () => `new-${++count}` }
}
const run = (
  current: RichText.EditorState,
  command: RichText.Command,
  ids = minted(),
  options?: RichText.RunOptions,
) => RichText.run(current, command, ids, options)
const success = (result: RichText.TransactionResult) => {
  if (!result.ok) throw new Error(result.error)
  return result
}
/** The nested block at a path, narrowed so a test can read its runs. */
const blockAt = (document: RichText.Document, ...path: ReadonlyArray<number>) => {
  let blocks: ReadonlyArray<RichText.Block> = document.children
  let found: RichText.Block | undefined
  for (const index of path) {
    found = blocks[index]
    if (found === undefined) throw new Error('missing block')
    blocks = found.type === 'Node' && found.blocks !== undefined ? found.blocks : []
  }
  return found!
}
/** The nested blocks of a container, asserting the path addresses one. */
const containerAt = (
  document: RichText.Document,
  ...path: ReadonlyArray<number>
): ReadonlyArray<RichText.Block> => {
  const block = blockAt(document, ...path)
  if (block.type !== 'Node' || block.blocks === undefined) {
    throw new Error('expected a container')
  }
  return block.blocks
}
const runsOf = (document: RichText.Document, ...path: ReadonlyArray<number>) =>
  blockAt(document, ...path).children.map(child => [child.text, child.marks] as const)

describe('editing inside a nested block', () => {
  it('types into a nested run and reports the block and run it touched', () => {
    const result = success(run(state(caret('a', 3)), { type: 'InsertText', text: 'X' }))
    expect(runsOf(result.state.document, 0, 0)).toEqual([['oneX', []]])
    // The container is untouched; the nested block and its run are dirty.
    expect([...result.changeSet.dirtyNodes].sort()).toEqual(['a', 'li1'])
    expect(result.changeSet.structureChanged).toBe(false)
    expect(result.state.selection).toEqual(caret('a', 4))
  })

  it('deletes backward inside a nested run without touching the container', () => {
    const result = success(run(state(caret('a', 3)), { type: 'DeleteBackward' }))
    expect(runsOf(result.state.document, 0, 0)).toEqual([['on', []]])
    expect(blockAt(result.state.document, 1).children[0]?.text).toBe('tail')
  })

  it('toggles a mark on a nested run', () => {
    const removed = success(
      run(state(range(['b', 0], ['b', 3])), { type: 'ToggleMark', mark: 'Bold' }),
    )
    expect(runsOf(removed.state.document, 0, 1)).toEqual([['two', []]])
    const added = success(
      run(state(range(['a', 0], ['a', 3])), { type: 'ToggleMark', mark: 'Italic' }),
    )
    expect(runsOf(added.state.document, 0, 0)).toEqual([['one', ['Italic']]])
  })

  it('splits a nested run when stored marks need their own span', () => {
    const result = success(
      run(state(caret('a', 1)), { type: 'InsertText', text: 'X', marks: ['Bold'] }, minted()),
    )
    expect(runsOf(result.state.document, 0, 0)).toEqual([
      ['o', []],
      ['X', ['Bold']],
      ['ne', []],
    ])
  })

  it('replaces a range inside one nested run', () => {
    const result = success(run(state(range(['a', 1], ['a', 2])), { type: 'InsertText', text: 'X' }))
    expect(runsOf(result.state.document, 0, 0)).toEqual([['oXe', []]])
  })

  it('changes a nested heading level, which moves no block', () => {
    const raised = success(RichText.apply(state(null), [RichText.Edit.setNodeProps(id('li2'), 4)]))
    expect(blockAt(raised.state.document, 0, 1)).toMatchObject({ type: 'Heading', level: 4 })
    expect(raised.changeSet.structureChanged).toBe(true)
  })

  it('merges two items inside a container, removing the boundary', () => {
    const result = success(run(state(range(['a', 1], ['b', 1])), { type: 'DeleteBackward' }))
    // The boundary goes: one item survives, holding both sides' remaining runs.
    expect(containerAt(result.state.document, 0).map(block => block.id)).toEqual(['li1'])
    expect(runsOf(result.state.document, 0, 0)).toEqual([
      ['o', []],
      ['wo', ['Bold']],
    ])
    expect(blockAt(result.state.document, 1).children[0]?.text).toBe('tail')
  })

  it('refuses a range that leaves its container, changing nothing', () => {
    const before = state(range(['a', 1], ['t', 1]))
    expect(run(before, { type: 'DeleteBackward' })).toEqual({
      ok: false,
      error: 'InvalidParent',
    })
    expect(runsOf(before.document, 0, 0)).toEqual([['one', []]])
    expect(blockAt(before.document, 1).children[0]?.text).toBe('tail')
  })

  it('splits a list item with Enter, keeping the new item inside the list', () => {
    const result = success(run(state(caret('a', 1)), { type: 'SplitBlock' }))
    const items = containerAt(result.state.document, 0)
    expect(items.map(block => block.children.map(run => run.text).join(''))).toEqual([
      'o',
      'ne',
      'two',
    ])
    // The halves are siblings in the list, and the original item keeps its id.
    expect(items[0]?.id).toBe('li1')
    expect(items[1]?.id).not.toBe('li1')
    expect(items[2]?.id).toBe('li2')
    expect(blockAt(result.state.document, 1).children[0]?.text).toBe('tail')
  })

  it('joins a list item with the previous sibling on Backspace', () => {
    const result = success(run(state(caret('b', 0)), { type: 'DeleteBackward' }))
    expect(containerAt(result.state.document, 0).map(block => block.id)).toEqual(['li1'])
    // The boundary goes; the runs keep their own marks.
    expect(runsOf(result.state.document, 0, 0)).toEqual([
      ['one', []],
      ['two', ['Bold']],
    ])
  })

  it('does nothing at the first item of a container', () => {
    const before = state(caret('a', 0))
    expect(success(run(before, { type: 'DeleteBackward' })).state).toBe(before)
  })

  it('pastes inside a list item, landing the content in the list', () => {
    const result = success(
      run(state(caret('a', 3)), {
        type: 'Paste',
        slice: RichText.sliceFromText('more', minted().mint),
      }),
    )
    expect(
      containerAt(result.state.document, 0).map(block =>
        block.children.map(run => run.text).join(''),
      ),
    ).toEqual(['one', 'more', 'two'])
  })

  it('moves a list item within its container, and refuses a bad parent', () => {
    const moved = success(
      RichText.apply(state(null), [RichText.Edit.moveBlock(id('li2'), 0, id('list'))]),
    )
    expect(containerAt(moved.state.document, 0).map(block => block.id)).toEqual(['li2', 'li1'])
    // A paragraph cannot hold blocks.
    expect(RichText.apply(state(null), [RichText.Edit.moveBlock(id('li1'), 0, id('li2'))])).toEqual(
      { ok: false, error: 'InvalidParent' },
    )
    // Nor can a missing parent.
    expect(
      RichText.apply(state(null), [RichText.Edit.moveBlock(id('li1'), 0, id('missing'))]),
    ).toEqual({ ok: false, error: 'MissingNode' })
  })

  it('moves a top-level block into a container and back out', () => {
    const inside = success(
      RichText.apply(state(null), [RichText.Edit.moveBlock(id('tail'), 1, id('list'))]),
    )
    expect(inside.state.document.children.map(block => block.id)).toEqual(['list', 'last'])
    expect(containerAt(inside.state.document, 0).map(block => block.id)).toEqual([
      'li1',
      'tail',
      'li2',
    ])
    const out = success(RichText.apply(inside.state, [RichText.Edit.moveBlock(id('tail'), 1)]))
    expect(out.state.document.children.map(block => block.id)).toEqual(['list', 'tail', 'last'])
    expect(containerAt(out.state.document, 0).map(block => block.id)).toEqual(['li1', 'li2'])
  })

  it('inserts a new block into a container', () => {
    const item = RichText.Paragraph.make({
      type: 'Paragraph',
      id: id('fresh'),
      children: [RichText.Text.make({ type: 'Text', id: id('ft'), text: 'new', marks: [] })],
    })
    const result = success(
      RichText.apply(state(null), [RichText.Edit.insertBlock(item, 1, id('list'))]),
    )
    expect(containerAt(result.state.document, 0).map(block => block.id)).toEqual([
      'li1',
      'fresh',
      'li2',
    ])
    expect(result.changeSet.insertedNodes).toEqual(new Set(['fresh', 'ft']))
  })

  it('deletes a nested block and lands the selection on a surviving nested run', () => {
    const result = success(
      RichText.apply(state(caret('a', 1)), [RichText.Edit.deleteBlock(id('li1'))]),
    )
    expect(containerAt(result.state.document, 0).map(block => block.id)).toEqual(['li2'])
    // The caret was inside the deleted item, so it lands on the nearest
    // surviving run in document order: the next item's first run.
    expect(result.state.selection).toEqual(caret('b', 0))
    expect(result.changeSet.removedNodes).toEqual(new Set(['li1', 'a']))
  })

  it('refuses a join between blocks that are not siblings', () => {
    expect(RichText.apply(state(null), [RichText.Edit.joinBlocks(id('li1'), id('tail'))])).toEqual({
      ok: false,
      error: 'InvalidParent',
    })
  })

  it('joins two containers of the same kind by concatenating their items', () => {
    const twoLists = RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Node',
          kind: 'List',
          id: 'l1',
          props: {},
          children: [],
          blocks: [
            {
              type: 'Paragraph',
              id: 'i1',
              children: [{ type: 'Text', id: 'x', text: 'x', marks: [] }],
            },
          ],
        },
        {
          type: 'Node',
          kind: 'List',
          id: 'l2',
          props: {},
          children: [],
          blocks: [
            {
              type: 'Paragraph',
              id: 'i2',
              children: [{ type: 'Text', id: 'y', text: 'y', marks: [] }],
            },
          ],
        },
      ],
    })
    const result = success(
      RichText.apply({ document: twoLists, selection: null }, [
        RichText.Edit.joinBlocks(id('l1'), id('l2')),
      ]),
    )
    // The removed list's items move into the survivor; nothing is dropped.
    expect(result.state.document.children.map(block => block.id)).toEqual(['l1'])
    expect(containerAt(result.state.document, 0).map(block => block.id)).toEqual(['i1', 'i2'])
  })

  it('refuses to join a container with a run holder', () => {
    const mixed = RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Node',
          kind: 'Callout',
          id: 'c1',
          props: {},
          children: [],
          blocks: [{ type: 'Paragraph', id: 'i1', children: [] }],
        },
        {
          type: 'Node',
          kind: 'Callout',
          id: 'c2',
          props: {},
          children: [{ type: 'Text', id: 't', text: 'x', marks: [] }],
        },
      ],
    })
    expect(
      RichText.apply({ document: mixed, selection: null }, [
        RichText.Edit.joinBlocks(id('c1'), id('c2')),
      ]),
    ).toEqual({ ok: false, error: 'InvalidRange' })
  })

  it('still edits the top level beside a container', () => {
    const result = success(run(state(caret('t', 4)), { type: 'InsertText', text: '!' }))
    expect(blockAt(result.state.document, 1).children[0]?.text).toBe('tail!')
    // A top-level merge still joins compatible neighbors, leaving the container
    // alone: deleting at the start of `last` folds it into `tail`.
    const joined = success(run(state(caret('z', 0)), { type: 'DeleteBackward' }))
    expect(joined.state.document.children.map(block => block.id)).toEqual(['list', 'tail'])
    expect(blockAt(joined.state.document, 1).children[0]?.text).toBe('taillast')
    expect(joined.state.document.children[0]).toMatchObject({
      id: 'list',
      blocks: [expect.objectContaining({ id: 'li1' }), expect.objectContaining({ id: 'li2' })],
    })
  })

  it('keeps the whole container intact across a nested edit', () => {
    const before = nested()
    const result = success(run(state(caret('a', 3)), { type: 'InsertText', text: 'X' }))
    // Untouched siblings keep identity and content.
    expect(blockAt(result.state.document, 0, 1)).toEqual(blockAt(before, 0, 1))
    expect(blockAt(result.state.document, 1)).toEqual(blockAt(before, 1))
    expect(result.changeSet.removedNodes).toEqual(new Set())
    expect(RichText.selectionIsValid(result.state.document, result.state.selection)).toBe(true)
  })
})
