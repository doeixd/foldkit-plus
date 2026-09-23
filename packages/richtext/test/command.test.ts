import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const id = RichText.NodeId.make
const caret = (
  node: string,
  offset: number,
  affinity: 'before' | 'after' = 'after',
): RichText.Selection => ({
  type: 'Range',
  anchor: { node: id(node), offset, affinity },
  focus: { node: id(node), offset, affinity },
})
const range = (
  anchor: readonly [string, number],
  focus: readonly [string, number],
): RichText.Selection => ({
  type: 'Range',
  anchor: { node: id(anchor[0]), offset: anchor[1], affinity: 'after' },
  focus: { node: id(focus[0]), offset: focus[1], affinity: 'after' },
})
const document = () =>
  RichText.decodeDocument({
    version: 1,
    children: [
      {
        type: 'Paragraph',
        id: 'p',
        children: [
          { type: 'Text', id: 'a', text: 'ab', marks: [] },
          { type: 'Text', id: 'b', text: 'cd', marks: ['Bold'] },
        ],
      },
      {
        type: 'Paragraph',
        id: 'q',
        children: [{ type: 'Text', id: 'c', text: 'ef', marks: [] }],
      },
    ],
  })
const state = (selection: RichText.Selection | null): RichText.EditorState => ({
  document: document(),
  selection,
})
const minted = () => {
  let count = 0
  return { mint: () => `new-${++count}` }
}
const run = (current: RichText.EditorState, command: RichText.Command, ids = minted()) =>
  RichText.run(current, command, ids)
const success = (result: RichText.TransactionResult) => {
  if (!result.ok) throw new Error(result.error)
  return result
}

describe('insert text commands', () => {
  it('types at a caret and leaves it after the inserted text', () => {
    const result = success(run(state(caret('a', 1)), { type: 'InsertText', text: 'XY' }))
    expect(result.state.document.children[0]?.children[0]).toEqual({
      type: 'Text',
      id: 'a',
      text: 'aXYb',
      marks: [],
    })
    expect(result.state.selection).toEqual(caret('a', 3))
  })

  it('keeps bold typing bold and drops code at a run edge', () => {
    const bold = success(run(state(caret('b', 2)), { type: 'InsertText', text: '!' }))
    expect(bold.state.document.children[0]?.children).toEqual([
      { type: 'Text', id: 'a', text: 'ab', marks: [] },
      { type: 'Text', id: 'b', text: 'cd!', marks: ['Bold'] },
    ])
    expect(bold.state.selection).toEqual(caret('b', 3))

    const plain = success(run(state(caret('b', 0, 'before')), { type: 'InsertText', text: '!' }))
    expect(plain.state.document.children[0]?.children[0]?.text).toBe('ab!')
    expect(plain.state.selection).toEqual(caret('a', 3))
  })

  it('replaces a range across runs in one command', () => {
    const result = success(run(state(range(['a', 1], ['b', 1])), { type: 'InsertText', text: 'Z' }))
    expect(result.state.document.children[0]?.children).toEqual([
      { type: 'Text', id: 'a', text: 'aZ', marks: [] },
      { type: 'Text', id: 'b', text: 'd', marks: ['Bold'] },
    ])
    expect(result.state.selection).toEqual(caret('a', 2))
  })

  it('refuses commands without a usable selection', () => {
    expect(run(state(null), { type: 'InsertText', text: 'x' })).toEqual({
      ok: false,
      error: 'InvalidSelection',
    })
    expect(run(state({ type: 'Node', node: id('p') }), { type: 'InsertText', text: 'x' })).toEqual({
      ok: false,
      error: 'InvalidSelection',
    })
  })
})

describe('delete commands', () => {
  it('deletes backward and forward within a run', () => {
    const back = success(run(state(caret('a', 2)), { type: 'DeleteBackward' }))
    expect(back.state.document.children[0]?.children[0]?.text).toBe('a')
    expect(back.state.selection).toEqual(caret('a', 1))

    const forward = success(run(state(caret('a', 0)), { type: 'DeleteForward' }))
    expect(forward.state.document.children[0]?.children[0]?.text).toBe('b')
    expect(forward.state.selection).toEqual(caret('a', 0))
  })

  it('steps into the neighbor run at a run edge', () => {
    const back = success(run(state(caret('b', 0)), { type: 'DeleteBackward' }))
    expect(back.state.document.children[0]?.children).toEqual([
      { type: 'Text', id: 'a', text: 'a', marks: [] },
      { type: 'Text', id: 'b', text: 'cd', marks: ['Bold'] },
    ])
    expect(back.state.selection).toEqual(caret('a', 1))

    const forward = success(run(state(caret('a', 2)), { type: 'DeleteForward' }))
    expect(forward.state.document.children[0]?.children).toEqual([
      { type: 'Text', id: 'a', text: 'ab', marks: [] },
      { type: 'Text', id: 'b', text: 'd', marks: ['Bold'] },
    ])
    expect(forward.state.selection).toEqual(caret('a', 2))
  })

  it('joins blocks at a block edge and places the caret at the junction', () => {
    const back = success(run(state(caret('c', 0)), { type: 'DeleteBackward' }))
    expect(back.state.document.children.map(block => block.id)).toEqual(['p'])
    expect(back.state.document.children[0]?.children.map(run => run.id)).toEqual(['a', 'b', 'c'])
    expect(back.state.selection).toEqual(caret('b', 2))

    const forward = success(run(state(caret('b', 2)), { type: 'DeleteForward' }))
    expect(forward.state.document.children.map(block => block.id)).toEqual(['p'])
    expect(forward.state.selection).toEqual(caret('b', 2))
  })

  it('deletes a range across blocks, joining them, and collapses the caret', () => {
    const result = success(run(state(range(['b', 1], ['c', 1])), { type: 'DeleteBackward' }))
    // The paragraph boundary the range covered goes with the text it covered.
    expect(result.state.document.children).toHaveLength(1)
    expect(result.state.document.children[0]?.children.map(run => run.id)).toEqual(['a', 'b', 'c'])
    expect(result.state.document.children[0]?.children.map(run => run.text)).toEqual([
      'ab',
      'c',
      'f',
    ])
    expect(result.state.selection).toEqual(caret('b', 1))
  })

  it('does nothing at the document edges', () => {
    const start = state(caret('a', 0))
    expect(success(run(start, { type: 'DeleteBackward' })).state).toBe(start)
    const end = state(caret('c', 2))
    expect(success(run(end, { type: 'DeleteForward' })).state).toBe(end)
  })
})

describe('split block commands', () => {
  it('splits at the caret and puts the caret in the new block', () => {
    const result = success(run(state(caret('b', 1)), { type: 'SplitBlock' }))
    expect(result.state.document.children.map(block => block.id)).toEqual(['p', 'new-2', 'q'])
    expect(result.state.document.children[1]).toEqual({
      type: 'Paragraph',
      id: 'new-2',
      children: [{ type: 'Text', id: 'new-1', text: 'd', marks: ['Bold'] }],
    })
    expect(result.state.selection).toEqual(caret('new-1', 0))
  })

  it('replaces a range first, then splits at its start', () => {
    const result = success(run(state(range(['a', 1], ['b', 1])), { type: 'SplitBlock' }))
    expect(result.state.document.children.map(block => block.id)).toEqual(['p', 'new-2', 'q'])
    expect(result.state.document.children[0]?.children).toEqual([
      { type: 'Text', id: 'a', text: 'a', marks: [] },
    ])
    expect(result.state.selection).toEqual(caret('new-1', 0))
  })

  it('mints every identity it needs from the caller', () => {
    const ids = minted()
    const result = success(run(state(caret('a', 1)), { type: 'SplitBlock' }, ids))
    expect(result.state.document.children[1]?.id).toBe('new-2')
    expect(result.state.document.children[1]?.children[0]?.id).toBe('new-1')
  })
})

describe('toggle mark commands', () => {
  it('adds a mark across a partial run by splitting first', () => {
    const result = success(
      run(state(range(['a', 0], ['a', 1])), { type: 'ToggleMark', mark: 'Italic' }),
    )
    expect(result.state.document.children[0]?.children).toEqual([
      { type: 'Text', id: 'a', text: 'a', marks: ['Italic'] },
      { type: 'Text', id: 'new-1', text: 'b', marks: [] },
      { type: 'Text', id: 'b', text: 'cd', marks: ['Bold'] },
    ])
    // The focus sits on the split boundary; affinity moves it to the new run,
    // which is the same visual position.
    expect(result.state.selection).toEqual(range(['a', 0], ['new-1', 0]))
  })

  it('adds a mark across whole runs and blocks', () => {
    const result = success(
      run(state(range(['a', 1], ['c', 1])), { type: 'ToggleMark', mark: 'Italic' }),
    )
    expect(result.state.document.children[0]?.children).toEqual([
      { type: 'Text', id: 'a', text: 'a', marks: [] },
      { type: 'Text', id: 'new-1', text: 'b', marks: ['Italic'] },
      { type: 'Text', id: 'b', text: 'cd', marks: ['Bold', 'Italic'] },
    ])
    expect(result.state.document.children[1]?.children[0]).toEqual({
      type: 'Text',
      id: 'c',
      text: 'e',
      marks: ['Italic'],
    })
    expect(result.state.document.children[1]?.children[1]).toEqual({
      type: 'Text',
      id: 'new-2',
      text: 'f',
      marks: [],
    })
  })

  it('removes the mark when every covered run already has it', () => {
    const result = success(
      run(state(range(['b', 0], ['b', 2])), { type: 'ToggleMark', mark: 'Bold' }),
    )
    // Both runs end up unmarked, so the merge pass folds them back together.
    expect(result.state.document.children[0]?.children).toEqual([
      { type: 'Text', id: 'a', text: 'abcd', marks: [] },
    ])
  })

  it('treats a collapsed caret as a no-op and refuses adding unknown marks', () => {
    const collapsed = state(caret('a', 1))
    expect(success(run(collapsed, { type: 'ToggleMark', mark: 'Bold' })).state).toBe(collapsed)
    expect(
      run(state(range(['a', 0], ['a', 2])), { type: 'ToggleMark', mark: 'Highlight' }),
    ).toEqual({ ok: false, error: 'InvalidInput' })
  })

  it('removes a preserved unknown mark by name', () => {
    const future: RichText.EditorState = {
      document: RichText.decodeDocument({
        version: 1,
        children: [
          {
            type: 'Paragraph',
            id: 'p',
            children: [{ type: 'Text', id: 'a', text: 'ab', marks: ['Highlight'] }],
          },
        ],
      }),
      selection: range(['a', 0], ['a', 2]),
    }
    const removed = success(run(future, { type: 'ToggleMark', mark: 'Highlight' }))
    expect(removed.state.document.children[0]?.children[0]?.marks).toEqual([])
    expect(RichText.findUnknownMarks(removed.state.document)).toEqual([])
  })
})

describe('set selection commands', () => {
  it('installs any selection, including null', () => {
    expect(
      success(run(state(null), { type: 'SetSelection', selection: caret('a', 1) })).state.selection,
    ).toEqual(caret('a', 1))
    expect(
      success(run(state(caret('a', 1)), { type: 'SetSelection', selection: null })).state.selection,
    ).toBeNull()
  })
})
