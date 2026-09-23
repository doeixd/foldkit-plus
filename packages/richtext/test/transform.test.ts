import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const id = RichText.NodeId.make
const position = (node: string, offset: number): RichText.Position => ({
  node: id(node),
  offset,
  affinity: 'after',
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
          { type: 'Text', id: 'b', text: '', marks: [] },
          { type: 'Text', id: 'c', text: 'cd', marks: ['Bold'] },
        ],
      },
      { type: 'Paragraph', id: 'q', children: [{ type: 'Text', id: 'd', text: 'ef', marks: [] }] },
    ],
  })
const state = (selection: RichText.Selection | null = null): RichText.EditorState => ({
  document: document(),
  selection,
})
const success = (result: RichText.TransactionResult) => {
  if (!result.ok) throw new Error(result.error)
  return result
}

/**
 * A custom transform: an empty run inside a touched block folds into the run
 * before it, carrying the positions that addressed it.
 */
const dropEmptyRuns: RichText.Transform = {
  name: 'dropEmptyRuns',
  apply: (current, context) => {
    const removedNodes = new Set<RichText.NodeId>()
    const dirtyNodes = new Set<RichText.NodeId>()
    const steps: Array<RichText.RelocateStep> = []
    let next = current
    for (const blockId of context.dirtyNodes) {
      const index = next.children.findIndex(block => block.id === blockId)
      if (index < 0) continue
      const block = next.children[index]!
      const kept: Array<RichText.Text> = []
      for (const run of block.children) {
        const previous = kept[kept.length - 1]
        if (run.text.length === 0 && previous !== undefined) {
          removedNodes.add(run.id)
          dirtyNodes.add(block.id)
          steps.push({ node: run.id, into: previous.id, at: 0, base: previous.text.length })
          continue
        }
        kept.push(run)
      }
      if (kept.length === block.children.length) continue
      const blocks = [...next.children]
      blocks[index] = { ...block, children: kept }
      next = { ...next, children: blocks }
    }
    return {
      document: next,
      steps,
      insertedNodes: new Set(),
      removedNodes,
      dirtyNodes,
      textChanged: new Set(),
      structureChanged: false,
    }
  },
}

/** A transform that always reports a change, so the loop never settles. */
const neverSettles: RichText.Transform = {
  name: 'neverSettles',
  apply: current => ({
    document: { ...current, children: current.children.map(block => ({ ...block })) },
    steps: [],
    insertedNodes: new Set(),
    removedNodes: new Set(),
    dirtyNodes: new Set(),
    textChanged: new Set(),
    structureChanged: false,
  }),
}

describe('transforms', () => {
  it('runs a registered transform and folds its report into the transaction', () => {
    const edited = state({ type: 'Range', anchor: position('b', 0), focus: position('b', 0) })
    const result = success(
      RichText.apply(
        edited,
        [RichText.Edit.insertText(RichText.Node.make('a').at(2, 'after'), '!')],
        [dropEmptyRuns],
      ),
    )
    expect(result.state.document.children[0]?.children).toEqual([
      { type: 'Text', id: 'a', text: 'ab!', marks: [] },
      { type: 'Text', id: 'c', text: 'cd', marks: ['Bold'] },
    ])
    expect(result.changeSet.removedNodes).toEqual(new Set(['b']))
    expect(result.changeSet.dirtyNodes.has(id('p'))).toBe(true)
    // The selection that was inside the retired run moved into its new home.
    expect(result.state.selection).toEqual({
      type: 'Range',
      anchor: position('a', 3),
      focus: position('a', 3),
    })
    expect(result.positionMap).toEqual([
      { node: 'a', from: 2, to: 2, inserted: 1 },
      { node: 'b', into: 'a', at: 0, base: 3 },
    ])
  })

  it('leaves untouched blocks alone', () => {
    const result = success(
      RichText.apply(
        state(),
        [RichText.Edit.insertText(RichText.Node.make('d').at(0, 'after'), 'X')],
        [dropEmptyRuns],
      ),
    )
    // The empty run lives in `p`, which the transaction never touched.
    expect(result.state.document.children[0]?.children.map(run => run.id)).toEqual(['a', 'b', 'c'])
    expect(result.changeSet.removedNodes).toEqual(new Set())
  })

  it('refuses a transform that never settles instead of spinning', () => {
    expect(RichText.apply(state(), [], [neverSettles])).toEqual({
      ok: false,
      error: 'UnstableNormalization',
    })
  })

  it('gives each pass its number, and stops at the bound', () => {
    const passes: Array<number> = []
    const counting: RichText.Transform = {
      name: 'counting',
      apply: (current, context) => {
        passes.push(context.pass)
        return neverSettles.apply(current, context)
      },
    }
    expect(RichText.apply(state(), [], [counting]).ok).toBe(false)
    expect(passes).toEqual([...Array(RichText.MAX_NORMALIZATION_PASSES).keys()])
  })

  it('is idempotent: the shipped merge settles in one pass and does nothing after', () => {
    const mergeable = RichText.decodeDocument({
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
      ],
    })
    const first = success(
      RichText.apply({ document: mergeable, selection: null }, [
        RichText.Edit.insertText(RichText.Node.make('b').at(2, 'after'), '!'),
      ]),
    )
    expect(first.state.document.children[0]?.children.map(run => run.id)).toEqual(['a'])
    const second = success(RichText.apply(first.state, []))
    expect(second.state).toBe(first.state)
    expect(second.changeSet.removedNodes).toEqual(new Set())
  })

  it('names the shipped registry', () => {
    expect(RichText.defaultTransforms.map(transform => transform.name)).toEqual([
      'mergeAdjacentRuns',
    ])
  })
})
