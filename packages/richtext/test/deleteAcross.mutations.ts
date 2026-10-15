/**
 * Deleting across kinds of block, each part broken in turn: `pnpm mutate
 * packages/richtext/test/deleteAcross.mutations.ts` checks that a test fails for every one.
 */
const file = '../src/command.ts'
const tests = [
  'packages/richtext/test/deleteAcross.test.ts',
  'packages/richtext/test/nestedEditing.test.ts',
]

export default [
  {
    name: 'a range over several kinds is refused, as it was',
    edits: [{ file, find: 'if (!joinable(survivor, block)) return undefined', replace: '' }],
    tests,
  },
  {
    name: 'the blocks between stay',
    edits: [
      { file, find: '    ...between.map(block => Edit.deleteBlock(block.id)),\n', replace: '' },
    ],
    tests,
  },
  {
    name: 'the far end is never joined',
    edits: [
      {
        file,
        find: 'if (adjacent && joinable(survivorAt.block, removedAt.block)) {',
        replace: 'if (false) {',
      },
    ],
    tests,
  },
  {
    name: 'a container left empty stays',
    edits: [{ file, find: '      operations.push(Edit.deleteBlock(container.id))\n', replace: '' }],
    tests,
  },
  {
    name: 'a table cell is crossed like any container',
    edits: [{ file, find: '  if (isolatingBetween) {', replace: '  if (false) {' }],
    tests,
  },
  {
    name: 'the far end comes up into any container',
    edits: [
      {
        file,
        find: '    !acceptsChild(now, parentPath, blockKind(removedAt.block), options.nodes)\n',
        replace: '    false\n',
      },
    ],
    tests,
  },
  {
    name: 'what replaces a cleared range is not run',
    edits: [
      {
        file,
        find: '      return followedBy(cleared, run(cleared.state, command, ids, options))',
        replace: '      return cleared',
      },
    ],
    tests,
  },
]
