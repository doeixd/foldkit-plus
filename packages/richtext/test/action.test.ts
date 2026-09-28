/**
 * Composed actions and the range-before read they need (§124 §5): an ordered command
 * list that commits as one transition, so what an input rule or a menu matched can be
 * removed and acted on as one step.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from '../src/index.js'

const id = RichText.NodeId.make

const document = () =>
  RichText.decodeDocument({
    version: 1,
    children: [
      {
        type: 'Paragraph',
        id: 'p',
        children: [
          { type: 'Text', id: 'a', text: 'ab', marks: [] },
          { type: 'Text', id: 'b', text: 'cd', marks: [] },
        ],
      },
      {
        type: 'Paragraph',
        id: 'q',
        children: [{ type: 'Text', id: 'c', text: 'ef', marks: [] }],
      },
    ],
  })

const caret = (node: string, offset: number): RichText.Selection => ({
  type: 'Range',
  anchor: { node: id(node), offset, affinity: 'after' },
  focus: { node: id(node), offset, affinity: 'after' },
})

const ids = () => ({ mint: () => 'e0' })
const state = (selection: RichText.Selection | null) => ({ document: document(), selection })

describe('the range before a caret', () => {
  it('covers the last characters, across runs, ending where the caret is', () => {
    // The caret sits at the end of the second run; three characters back is one into
    // the first, which is what makes a range span a run boundary.
    expect(
      RichText.textRangeBefore(document(), { node: id('b'), offset: 2, affinity: 'after' }, 3),
    ).toEqual({
      type: 'Range',
      anchor: { node: id('a'), offset: 1, affinity: 'before' },
      focus: { node: id('b'), offset: 2, affinity: 'after' },
    })
  })

  it('ends a boundary endpoint with `after` affinity, where the caret would sit', () => {
    expect(
      RichText.textRangeBefore(document(), { node: id('a'), offset: 2, affinity: 'after' }, 2),
    ).toEqual({
      type: 'Range',
      anchor: { node: id('a'), offset: 0, affinity: 'before' },
      focus: { node: id('a'), offset: 2, affinity: 'after' },
    })
  })

  it('reads within whichever block holds the position', () => {
    expect(
      RichText.textRangeBefore(document(), { node: id('c'), offset: 1, affinity: 'before' }, 1),
    ).toEqual({
      type: 'Range',
      anchor: { node: id('c'), offset: 0, affinity: 'before' },
      focus: { node: id('c'), offset: 1, affinity: 'before' },
    })
  })

  it('is nothing when the block does not hold that many characters before the caret', () => {
    expect(
      RichText.textRangeBefore(document(), { node: id('a'), offset: 1, affinity: 'before' }, 5),
    ).toBeUndefined()
  })

  it('clamps an offset past its run, as `textBefore` does, rather than reading into the next', () => {
    // Offset 5 in `ab` reads as its end: the one character before it is `b`, not the `c` a
    // block offset of 5 - 1 would land on in the next run.
    expect(
      RichText.textRangeBefore(document(), { node: id('a'), offset: 5, affinity: 'after' }, 1),
    ).toEqual({
      type: 'Range',
      anchor: { node: id('a'), offset: 1, affinity: 'before' },
      focus: { node: id('a'), offset: 2, affinity: 'after' },
    })
  })

  it('is nothing for a length that reads nothing, or a node this document lacks', () => {
    expect(
      RichText.textRangeBefore(document(), { node: id('a'), offset: 2, affinity: 'after' }, 0),
    ).toBeUndefined()
    expect(
      RichText.textRangeBefore(document(), { node: id('nope'), offset: 0, affinity: 'before' }, 1),
    ).toBeUndefined()
  })
})

describe('the start of a range', () => {
  const range = (anchor: readonly [string, number], focus: readonly [string, number]) => ({
    type: 'Range' as const,
    anchor: { node: id(anchor[0]), offset: anchor[1], affinity: 'before' as const },
    focus: { node: id(focus[0]), offset: focus[1], affinity: 'before' as const },
  })

  it('is the end that comes first, across blocks, runs, and offsets in one run', () => {
    // Each pair is written backwards, so the focus is the start every time.
    for (const [anchor, focus] of [
      [
        ['c', 1],
        ['a', 1],
      ],
      [
        ['b', 0],
        ['a', 1],
      ],
      [
        ['a', 2],
        ['a', 1],
      ],
    ] as const) {
      expect(RichText.rangeStart(document(), range(anchor, focus))).toEqual(
        range(anchor, focus).focus,
      )
      expect(RichText.rangeStart(document(), range(focus, anchor))).toEqual(
        range(focus, anchor).anchor,
      )
    }
  })

  it('is nothing when an end does not resolve', () => {
    expect(RichText.rangeStart(document(), range(['nope', 0], ['a', 1]))).toBeUndefined()
  })
})

describe('a composed action', () => {
  it('runs a single command exactly as `run` does', () => {
    const start = state(caret('a', 2))
    expect(RichText.runAction(start, [{ type: 'InsertText', text: '!' }], ids())).toEqual(
      RichText.run(start, { type: 'InsertText', text: '!' }, ids()),
    )
  })

  it('applies its commands in order, against the state the last one left', () => {
    const start = state(caret('c', 2))
    const range = RichText.textRangeBefore(
      start.document,
      { node: id('c'), offset: 2, affinity: 'after' },
      2,
    )
    expect(range).toBeDefined()
    if (range === undefined) return
    const result = RichText.runAction(
      start,
      [
        { type: 'SetSelection', selection: range },
        { type: 'DeleteBackward' },
        { type: 'RetypeBlock', to: { type: 'Heading', level: 2 } },
      ],
      ids(),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // The marker is gone and the block it was in became the heading, in one state.
    expect(result.state.document.children[1]).toMatchObject({ type: 'Heading', level: 2 })
    expect(result.state.document.children[1]?.children.map(run => run.text).join('')).toBe('')
    expect(result.changeSet.structureChanged).toBe(true)
    expect(result.changeSet.dirtyNodes.has(id('q'))).toBe(true)
  })

  it('returns the refusing command’s error, and no half-applied state', () => {
    const result = RichText.runAction(
      state(caret('a', 2)),
      [
        // A node selection is valid to set, but a delete needs a caret in text.
        { type: 'SetSelection', selection: { type: 'Node', node: id('p') } },
        { type: 'DeleteBackward' },
      ],
      ids(),
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('InvalidSelection')
  })

  it('is a no-op when it holds no commands, as an empty transaction is', () => {
    const start = state(caret('a', 2))
    const result = RichText.runAction(start, [], ids())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.document).toBe(start.document)
    expect(result.state.selection).toBe(start.selection)
    expect(result.changeSet.dirtyNodes.size).toBe(0)
  })
})
