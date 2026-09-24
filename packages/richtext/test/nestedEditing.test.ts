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

  it('refuses a merge inside a container and changes nothing', () => {
    const before = state(range(['a', 1], ['b', 1]))
    expect(run(before, { type: 'DeleteBackward' })).toEqual({
      ok: false,
      error: 'InvalidParent',
    })
    expect(before.document.children[0]).toMatchObject({ id: 'list' })
    expect(runsOf(before.document, 0, 0)).toEqual([['one', []]])
  })

  it('refuses structural placement inside a container', () => {
    expect(run(state(caret('a', 1)), { type: 'SplitBlock' })).toEqual({
      ok: false,
      error: 'InvalidParent',
    })
    expect(
      run(state(caret('a', 1)), {
        type: 'Paste',
        slice: RichText.sliceFromText('pasted', minted().mint),
      }),
    ).toEqual({ ok: false, error: 'InvalidParent' })
    // At the start of a nested block the split path is not what refuses it:
    // placement at a top-level index would otherwise land in the wrong place.
    expect(
      run(state(caret('a', 0)), {
        type: 'Paste',
        slice: RichText.sliceFromText('pasted', minted().mint),
      }),
    ).toEqual({ ok: false, error: 'InvalidParent' })
    // A range inside a container needs a join this version cannot express, so
    // the split is refused before any operation is built.
    expect(run(state(range(['a', 0], ['b', 1])), { type: 'SplitBlock' })).toEqual({
      ok: false,
      error: 'InvalidParent',
    })
    expect(RichText.apply(state(null), [RichText.Edit.moveBlock(id('li1'), 1)])).toEqual({
      ok: false,
      error: 'InvalidParent',
    })
    expect(RichText.apply(state(null), [RichText.Edit.deleteBlock(id('li1'))])).toEqual({
      ok: false,
      error: 'InvalidParent',
    })
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
