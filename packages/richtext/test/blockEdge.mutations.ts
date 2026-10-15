/**
 * Block edges beside a block they cannot join, each part broken in turn: `pnpm mutate
 * packages/richtext/test/blockEdge.mutations.ts` checks that a test fails for every one.
 */
const file = '../src/command.ts'
const tests = [
  'packages/richtext/test/blockEdge.test.ts',
  'packages/richtext/test/lift.test.ts',
  'packages/richtext/test/wrap.test.ts',
]

export default [
  {
    name: 'the edge only steps, never joining a quote’s line',
    edits: [{ file, find: 'if (!stepsOnly && (backward', replace: 'if (false && (backward' }],
    tests,
  },
  {
    name: 'an empty line takes a quote’s line out of it',
    edits: [
      {
        file,
        find: '      const stepsOnly = empty && neighborBlock !== undefined',
        replace: '      const stepsOnly = false',
      },
    ],
    tests,
  },
  {
    name: 'Delete at a container’s end reaches nothing',
    edits: [
      {
        file,
        find: '          ? nextLeaf(state.document, at.path)',
        replace: '          ? undefined',
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
        find: '      if (neighborBlock === undefined || (!backward && !empty)) return apply(state, [])',
        replace: '      if (neighborBlock === undefined) return apply(state, [])',
      },
    ],
    tests,
  },
  {
    name: 'Backspace lands at the neighbour’s start',
    edits: [
      {
        file,
        find: '        offset: backward ? target.text.length : 0,',
        replace: '        offset: 0,',
      },
    ],
    tests,
  },
  {
    name: 'the edge reaches the outer block, not the line inside it',
    edits: [
      {
        file,
        find: '    if ((nestedBlocks(block) ?? []).length === 0) found = at',
        replace: '    found = at',
      },
    ],
    tests,
  },
  {
    name: 'an image past the end of a list is joined like text',
    edits: [
      {
        file,
        find: "        return apply(state, [Edit.setSelection({ type: 'Node', node: leaf.id })])",
        replace: '        return apply(state, [])',
      },
    ],
    tests,
  },
]
