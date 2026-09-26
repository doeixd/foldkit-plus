import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const at = (node: string, offset: number) => ({
  node: RichText.NodeId.make(node),
  offset,
  affinity: 'after' as const,
})
const range = (
  anchor: ReturnType<typeof at>,
  focus: ReturnType<typeof at>,
): RichText.Selection => ({
  type: 'Range',
  anchor,
  focus,
})

describe('coversText', () => {
  it.each<[string, RichText.Selection | null, boolean]>([
    ['a caret', range(at('a', 2), at('a', 2)), false],
    ['a range within a run', range(at('a', 1), at('a', 3)), true],
    // Same offset, different runs: not a caret.
    ['a range across runs', range(at('a', 2), at('b', 2)), true],
    ['a backward range', range(at('a', 3), at('a', 1)), true],
    ['a node selection', { type: 'Node', node: RichText.NodeId.make('a') }, false],
    ['no selection', null, false],
  ])('%s', (_, selection, expected) => {
    expect(RichText.coversText(selection)).toBe(expected)
  })
})
