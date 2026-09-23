/**
 * What a large edit costs (richtext-DESIGN §77).
 *
 * Three shapes an editor actually meets: pasting a lot of text into one run,
 * formatting a long selection that spans many runs, and deleting a range across
 * paragraphs. The numbers are recorded in the package README; the per-operation
 * array copies the review flagged are still here, so this measures the cost
 * rather than claiming a target is met.
 */
import { describe, test } from 'vitest'
import * as RichText from 'foldkit-richtext'

// Vitest 5 hands `bench` to a test as a context fixture; this keeps each case one line.
const benchmark = (name: string, run: () => unknown) =>
  test(name, async ({ bench }) => {
    await bench(name, run).run()
  })

const id = RichText.NodeId.make
const ids = () => {
  let count = 0
  return { mint: () => `n${++count}` }
}

/** One paragraph of `runs` runs, each `length` characters, alternating marks. */
const manyRuns = (runs: number, length = 12): RichText.EditorState => {
  const children = Array.from({ length: runs }, (_, index) => ({
    type: 'Text' as const,
    id: id(`r${index}`),
    text: 'x'.repeat(length),
    marks: index % 2 === 0 ? [] : ['Bold'],
  }))
  return {
    document: RichText.decodeDocument({
      version: 1,
      children: [{ type: 'Paragraph', id: 'p', children }],
    }),
    selection: null,
  }
}

/** One paragraph per block, for the structural shapes. */
const manyBlocks = (blocks: number): RichText.EditorState => ({
  document: RichText.decodeDocument({
    version: 1,
    children: Array.from({ length: blocks }, (_, index) => ({
      type: 'Paragraph' as const,
      id: id(`p${index}`),
      children: [{ type: 'Text' as const, id: id(`t${index}`), text: 'abc', marks: [] }],
    })),
  }),
  selection: null,
})

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

describe('text', () => {
  benchmark('paste 50k characters into one run', () => {
    RichText.run(
      { ...manyRuns(1, 20), selection: caret('r0', 10) },
      { type: 'InsertText', text: 'x'.repeat(50_000) },
      ids(),
    )
  })

  benchmark('type one character into a 20k-character run', () => {
    RichText.run(
      { ...manyRuns(1, 20_000), selection: caret('r0', 10_000) },
      { type: 'InsertText', text: 'x' },
      ids(),
    )
  })
})

describe('formatting', () => {
  benchmark('toggle a mark over a 400-run selection', () => {
    RichText.run(
      { ...manyRuns(400), selection: range(['r0', 0], ['r399', 12]) },
      { type: 'ToggleMark', mark: 'Italic' },
      ids(),
    )
  })

  benchmark('toggle a mark over 200 runs across 200 blocks', () => {
    const state = manyBlocks(200)
    RichText.run(
      {
        ...state,
        selection: range(['t0', 0], ['t199', 3]),
      },
      { type: 'ToggleMark', mark: 'Italic' },
      ids(),
    )
  })
})

describe('structure', () => {
  benchmark('delete a range spanning 100 paragraphs', () => {
    const state = manyBlocks(200)
    RichText.run(
      { ...state, selection: range(['t0', 1], ['t99', 2]) },
      { type: 'DeleteBackward' },
      ids(),
    )
  })

  benchmark('split a block inside a 400-run paragraph', () => {
    RichText.run({ ...manyRuns(400), selection: caret('r200', 6) }, { type: 'SplitBlock' }, ids())
  })

  benchmark('paste one paragraph into a 200-block document', () => {
    const state = manyBlocks(200)
    const slice = RichText.sliceFromText('pasted', ids().mint)
    RichText.run({ ...state, selection: caret('t100', 3) }, { type: 'Paste', slice }, ids())
  })
})
