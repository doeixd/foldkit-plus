/**
 * Selecting an atom whole, each part broken in turn: `pnpm mutate
 * packages/richtext/test/atomSelection.mutations.ts` checks that a test fails for every one.
 */
const file = '../src/command.ts'
const tests = ['packages/richtext/test/atomSelection.test.ts']

export default [
  {
    name: 'an edge joins into an atom as into text',
    edits: [
      {
        file,
        find: 'if (neighborBlock !== undefined && isAtom(options.nodes, neighborBlock)) {',
        replace: 'if (false) {',
      },
    ],
    tests,
  },
  {
    name: 'the empty line stays when the edge selects the atom',
    edits: [
      {
        file,
        find: "...(textOfBlock(block) === '' ? [Edit.deleteBlock(block.id)] : []),",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a vocabulary is not asked what an atom is',
    edits: [{ file, find: "    : declared.kind === 'atom'", replace: '    : false' }],
    tests,
  },
  {
    name: 'Delete on a selected block does nothing',
    edits: [
      {
        file,
        find: "      return run(state, { type: 'DeleteBlock', node: selection.node }, ids, options)",
        replace: "      return failure('InvalidSelection')",
      },
    ],
    tests,
  },
  {
    name: 'Enter on a selected block does nothing',
    edits: [
      {
        file,
        find: "    if (command.type === 'SplitBlock') return run(state, after, ids, options)",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'typing over a selected block keeps it',
    edits: [
      {
        file,
        find: "        [after, { type: 'DeleteBlock', node: selection.node }, command],",
        replace: '        [after, command],',
      },
    ],
    tests,
  },
  {
    name: 'a deleted atom lands the caret by the runs it held',
    edits: [
      {
        file,
        find: 'const following = runs.find(entry => entry.after && !entry.inside)',
        replace: 'const following = runs.find(entry => !entry.inside)',
      },
    ],
    tests,
  },
]
