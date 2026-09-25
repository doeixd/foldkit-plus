import { describe, expect, it } from 'vitest'
import { Schema } from 'effect'
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

describe('the marks a selection carries', () => {
  const emptyRuns = () =>
    RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Paragraph',
          id: 'p',
          children: [
            { type: 'Text', id: 'a', text: '', marks: [] },
            { type: 'Text', id: 'b', text: '', marks: ['Italic'] },
          ],
        },
      ],
    })
  const bothBold = () =>
    RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Paragraph',
          id: 'p',
          children: [
            { type: 'Text', id: 'a', text: 'ab', marks: ['Bold'] },
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
  const list = () =>
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
              children: [{ type: 'Text', id: 'x', text: 'ax', marks: ['Bold'] }],
            },
            {
              type: 'Paragraph',
              id: 'li2',
              children: [{ type: 'Text', id: 'y', text: 'by', marks: ['Bold'] }],
            },
          ],
        },
      ],
    })

  it('reports nothing without a selection, or one that does not resolve', () => {
    expect(RichText.marksInRange(document(), null)).toEqual(new Set())
    expect(RichText.marksInRange(document(), caret('missing', 0))).toEqual(new Set())
    expect(RichText.marksInRange(document(), range(['missing', 0], ['b', 1]))).toEqual(new Set())
    expect(RichText.marksInRange(document(), { type: 'Node', node: id('missing') })).toEqual(
      new Set(),
    )
  })

  it('reports the caret run marks', () => {
    expect(RichText.marksInRange(document(), caret('a', 1))).toEqual(new Set())
    expect(RichText.marksInRange(document(), caret('b', 1))).toEqual(new Set(['Bold']))
  })

  it('reports what a range agrees on', () => {
    expect(RichText.marksInRange(document(), range(['b', 0], ['b', 1]))).toEqual(new Set(['Bold']))
    // A marked run and a plain one agree on nothing.
    expect(RichText.marksInRange(document(), range(['a', 0], ['b', 2]))).toEqual(new Set())
    expect(RichText.marksInRange(document(), range(['b', 1], ['c', 1]))).toEqual(new Set())
    // A range across a boundary covers no text at all, so nothing is shared.
    expect(RichText.marksInRange(document(), range(['a', 2], ['b', 0]))).toEqual(new Set())
  })

  it('reports an empty run marks, which is how a caret holds a format', () => {
    expect(RichText.marksInRange(emptyRuns(), caret('a', 0))).toEqual(new Set())
    expect(RichText.marksInRange(emptyRuns(), caret('b', 0))).toEqual(new Set(['Italic']))
  })

  it('reports what a node selection agrees on, at any depth', () => {
    expect(RichText.marksInRange(bothBold(), { type: 'Node', node: id('p') })).toEqual(
      new Set(['Bold']),
    )
    expect(RichText.marksInRange(bothBold(), { type: 'Node', node: id('q') })).toEqual(new Set())
    expect(RichText.marksInRange(list(), { type: 'Node', node: id('list') })).toEqual(
      new Set(['Bold']),
    )
  })
})

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

  it('adds a declared mark with props, then removes it by name', () => {
    const Link = RichText.mark('Link', { Props: Schema.Struct({ href: Schema.String }) })
    const ArticleKit = RichText.kit({ nodes: [], marks: [RichText.Bold, Link] })
    const options = { marks: RichText.markRegistry(ArticleKit.marks) }
    const added = success(
      run(
        state(range(['a', 0], ['a', 2])),
        { type: 'ToggleMark', mark: Link.of({ href: '/docs' }) },
        minted(),
        options,
      ),
    )
    expect(added.state.document.children[0]?.children[0]?.marks).toEqual([
      { name: 'Link', props: { href: '/docs' } },
    ])

    // The toggle keys on the name, so a different href still removes it.
    const removed = success(
      run(
        { document: added.state.document, selection: range(['a', 0], ['a', 2]) },
        { type: 'ToggleMark', mark: Link.of({ href: '/other' }) },
        minted(),
        options,
      ),
    )
    expect(removed.state.document.children[0]?.children[0]?.marks).toEqual([])
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

describe('retyping the block the caret is in', () => {
  it('makes the caret\u2019s paragraph a heading, keeping its runs and the caret', () => {
    const before = state(caret('b', 1))
    const result = success(run(before, { type: 'RetypeBlock', to: { type: 'Heading', level: 2 } }))
    expect(result.state.document.children[0]).toEqual({
      type: 'Heading',
      id: 'p',
      level: 2,
      children: [
        { type: 'Text', id: 'a', text: 'ab', marks: [] },
        { type: 'Text', id: 'b', text: 'cd', marks: ['Bold'] },
      ],
    })
    // The runs are the same objects and the caret still addresses one of them.
    expect(result.state.document.children[0]?.children).toBe(before.document.children[0]?.children)
    expect(result.state.selection).toEqual(caret('b', 1))
    expect(result.changeSet.dirtyNodes).toEqual(new Set(['p']))
    expect(result.changeSet.structureChanged).toBe(true)
  })

  it('makes a heading a paragraph again', () => {
    const heading = success(
      run(state(caret('c', 1)), { type: 'RetypeBlock', to: { type: 'Heading', level: 1 } }),
    )
    const back = success(
      run(
        { ...heading.state, selection: caret('c', 1) },
        { type: 'RetypeBlock', to: { type: 'Paragraph' } },
      ),
    )
    expect(back.state.document.children[1]).toEqual({
      type: 'Paragraph',
      id: 'q',
      children: [{ type: 'Text', id: 'c', text: 'ef', marks: [] }],
    })
    expect(back.state.selection).toEqual(caret('c', 1))
  })

  it('retypes the block the selection starts in, not every block it covers', () => {
    const result = success(
      run(state(range(['b', 0], ['c', 1])), {
        type: 'RetypeBlock',
        to: { type: 'Heading', level: 3 },
      }),
    )
    expect(result.state.document.children.map(block => block.type)).toEqual([
      'Heading',
      'Paragraph',
    ])
    // The selection survives, because no identity changed.
    expect(result.state.selection).toEqual(range(['b', 0], ['c', 1]))
  })

  it('refuses when there is no text block under the selection', () => {
    expect(run(state(null), { type: 'RetypeBlock', to: { type: 'Paragraph' } })).toEqual({
      ok: false,
      error: 'InvalidSelection',
    })
    expect(
      run(state(caret('missing', 0)), { type: 'RetypeBlock', to: { type: 'Paragraph' } }),
    ).toEqual({ ok: false, error: 'MissingText' })
  })
})
