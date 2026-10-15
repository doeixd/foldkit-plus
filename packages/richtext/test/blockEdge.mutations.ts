/**
 * Block edges beside a block they cannot join, each part broken in turn: `pnpm mutate
 * packages/richtext/test/blockEdge.mutations.ts` checks that a test fails for every one.
 */
const file = '../src/command.ts'
const tests = ['packages/richtext/test/blockEdge.test.ts', 'packages/richtext/test/wrap.test.ts']

export default [
  {
    name: 'the edge refuses, as before',
    edits: [
      {
        file,
        find: '      !joinable(backward ? neighborBlock : block, backward ? block : neighborBlock)',
        replace: '      false',
      },
    ],
    tests,
  },
  {
    name: 'an emptied line stays',
    edits: [
      { file, find: '        ...(empty ? [Edit.deleteBlock(block.id)] : []),\n', replace: '' },
    ],
    tests,
  },
  {
    name: 'Delete steps from a line with text',
    edits: [
      {
        file,
        find: '      if (target === undefined || (!backward && !empty)) return apply(state, [])',
        replace: '      if (target === undefined) return apply(state, [])',
      },
    ],
    tests,
  },
  {
    name: 'Backspace lands at the neighbour’s start',
    edits: [{ file, find: 'offset: backward ? target.text.length : 0,', replace: 'offset: 0,' }],
    tests,
  },
]
