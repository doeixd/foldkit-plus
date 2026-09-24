import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const id = RichText.NodeId.make
const run = (runId: string, text: string, marks: ReadonlyArray<RichText.RunMark>) => ({
  type: 'Text',
  id: runId,
  text,
  marks: [...marks],
})
const doc = (blocks: ReadonlyArray<{ blockId: string; runs: ReturnType<typeof run>[] }>) =>
  RichText.decodeDocument({
    version: 1,
    children: blocks.map(block => ({ type: 'Paragraph', id: block.blockId, children: block.runs })),
  })
const success = (result: RichText.TransactionResult) => {
  if (!result.ok) throw new Error(result.error)
  return result
}

describe('run normalization', () => {
  it('loads adjacent equivalents verbatim but merges them on first edit', () => {
    const loaded = doc([
      { blockId: 'p', runs: [run('a', 'ab', ['Bold']), run('b', 'cd', ['Bold'])] },
    ])
    expect(loaded.children[0]?.children.map(child => child.id)).toEqual(['a', 'b'])
    const result = success(
      RichText.apply({ document: loaded, selection: null }, [
        RichText.Edit.insertText(RichText.Node.make('b').at(2, 'after'), '!'),
      ]),
    )
    expect(result.state.document.children[0]?.children).toEqual([
      { type: 'Text', id: 'a', text: 'abcd!', marks: ['Bold'] },
    ])
    expect(result.changeSet.removedNodes).toEqual(new Set(['b']))
    expect(result.positionMap).toEqual([
      { node: 'b', from: 2, to: 2, inserted: 1 },
      { node: 'b', into: 'a', at: 0, base: 2 },
    ])
  })

  it('merges cascades in one pass, keeping the first identity', () => {
    const result = success(
      RichText.apply(
        {
          document: doc([
            { blockId: 'p', runs: [run('a', 'ab', []), run('b', 'cd', []), run('c', 'ef', [])] },
          ]),
          selection: null,
        },
        [RichText.Edit.insertText(RichText.Node.make('c').at(2, 'after'), '!')],
      ),
    )
    expect(result.state.document.children[0]?.children).toEqual([
      { type: 'Text', id: 'a', text: 'abcdef!', marks: [] },
    ])
    expect(result.positionMap).toEqual([
      { node: 'c', from: 2, to: 2, inserted: 1 },
      { node: 'b', into: 'a', at: 0, base: 2 },
      { node: 'c', into: 'a', at: 0, base: 4 },
    ])
  })

  it('treats mark sets as unordered and never merges across blocks', () => {
    const result = success(
      RichText.apply(
        {
          document: doc([
            {
              blockId: 'p',
              runs: [run('a', 'ab', ['Bold', 'Italic']), run('b', 'cd', ['Italic', 'Bold'])],
            },
            { blockId: 'p2', runs: [run('c', 'ef', ['Bold', 'Italic'])] },
          ]),
          selection: null,
        },
        [
          RichText.Edit.insertText(RichText.Node.make('a').at(0, 'after'), '!'),
          RichText.Edit.insertText(RichText.Node.make('c').at(2, 'after'), '!'),
        ],
      ),
    )
    expect(result.state.document.children[0]?.children).toEqual([
      { type: 'Text', id: 'a', text: '!abcd', marks: ['Bold', 'Italic'] },
    ])
    expect(result.state.document.children[1]?.children).toEqual([
      { type: 'Text', id: 'c', text: 'ef!', marks: ['Bold', 'Italic'] },
    ])
    expect(result.positionMap).toEqual([
      { node: 'a', from: 0, to: 0, inserted: 1 },
      { node: 'c', from: 2, to: 2, inserted: 1 },
      { node: 'b', into: 'a', at: 0, base: 3 },
    ])
    expect(RichText.findUnknownMarks(result.state.document)).toEqual([])
  })

  it('merges unknown marks only with identical sets and keeps them visible', () => {
    const result = success(
      RichText.apply(
        {
          document: doc([
            { blockId: 'p', runs: [run('a', 'ab', ['Highlight']), run('b', 'cd', ['Highlight'])] },
          ]),
          selection: null,
        },
        [RichText.Edit.insertText(RichText.Node.make('b').at(2, 'after'), '!')],
      ),
    )
    expect(result.state.document.children[0]?.children).toEqual([
      { type: 'Text', id: 'a', text: 'abcd!', marks: ['Highlight'] },
    ])
    expect(RichText.findUnknownMarks(result.state.document)).toEqual([
      { node: 'a', mark: 'Highlight' },
    ])

    const distinct = success(
      RichText.apply(
        {
          document: doc([
            { blockId: 'p', runs: [run('a', 'ab', ['Bold']), run('b', 'cd', ['Highlight'])] },
          ]),
          selection: null,
        },
        [RichText.Edit.insertText(RichText.Node.make('a').at(0, 'after'), '!')],
      ),
    )
    expect(distinct.state.document.children[0]?.children.map(child => child.id)).toEqual(['a', 'b'])
    expect(distinct.state.document.children[0]?.children[0]?.text).toBe('!ab')
    expect(distinct.positionMap).toEqual([{ node: 'a', from: 0, to: 0, inserted: 1 }])
    expect(distinct.changeSet.removedNodes).toEqual(new Set())
  })

  it('maps selections through merges and stays stable on second edit', () => {
    const first = success(
      RichText.apply(
        {
          document: doc([{ blockId: 'p', runs: [run('a', 'ab', []), run('b', 'cd', [])] }]),
          selection: {
            type: 'Range',
            anchor: { node: id('b'), offset: 1, affinity: 'after' },
            focus: { node: id('a'), offset: 0, affinity: 'before' },
          },
        },
        [RichText.Edit.insertText(RichText.Node.make('a').at(0, 'after'), '!')],
      ),
    )
    expect(first.state.document.children[0]?.children).toEqual([
      { type: 'Text', id: 'a', text: '!abcd', marks: [] },
    ])
    expect(first.state.selection).toEqual({
      type: 'Range',
      anchor: { node: id('a'), offset: 4, affinity: 'after' },
      focus: { node: id('a'), offset: 0, affinity: 'before' },
    })
    expect(first.positionMap).toEqual([
      { node: 'a', from: 0, to: 0, inserted: 1 },
      { node: 'b', into: 'a', at: 0, base: 3 },
    ])
    const second = success(
      RichText.apply(first.state, [
        RichText.Edit.insertText(RichText.Node.make('a').at(5, 'after'), '!'),
      ]),
    )
    expect(second.state.document.children[0]?.children).toEqual([
      { type: 'Text', id: 'a', text: '!abcd!', marks: [] },
    ])
    expect(second.positionMap).toEqual([{ node: 'a', from: 5, to: 5, inserted: 1 }])
  })

  it('merges empty runs without special cases', () => {
    const result = success(
      RichText.apply(
        {
          document: doc([{ blockId: 'p', runs: [run('a', '', []), run('b', 'x', [])] }]),
          selection: null,
        },
        [RichText.Edit.insertText(RichText.Node.make('b').at(1, 'after'), '!')],
      ),
    )
    expect(result.state.document.children[0]?.children).toEqual([
      { type: 'Text', id: 'a', text: 'x!', marks: [] },
    ])
  })

  it('merges a mark with props only when the props agree', () => {
    const link = (href: string) => ({ name: 'Link', props: { href } })
    const merged = success(
      RichText.apply(
        {
          document: doc([
            { blockId: 'p', runs: [run('a', 'ab', [link('/x')]), run('b', 'cd', [link('/x')])] },
          ]),
          selection: null,
        },
        [RichText.Edit.insertText(RichText.Node.make('b').at(2, 'after'), '!')],
      ),
    )
    expect(merged.state.document.children[0]?.children).toEqual([
      { type: 'Text', id: 'a', text: 'abcd!', marks: [link('/x')] },
    ])

    // The same name with different props is a different mark, so the runs stay
    // apart — the props are part of the mark's identity, not decoration.
    const distinct = success(
      RichText.apply(
        {
          document: doc([
            { blockId: 'p', runs: [run('a', 'ab', [link('/x')]), run('b', 'cd', [link('/y')])] },
          ]),
          selection: null,
        },
        [RichText.Edit.insertText(RichText.Node.make('a').at(0, 'after'), '!')],
      ),
    )
    expect(distinct.state.document.children[0]?.children.map(child => child.id)).toEqual(['a', 'b'])
    expect(distinct.changeSet.removedNodes).toEqual(new Set())
  })
})
