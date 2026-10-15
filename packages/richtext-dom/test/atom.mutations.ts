/**
 * Selecting an atom in the browser, each part broken in turn: `pnpm mutate
 * packages/richtext-dom/test/atom.mutations.ts` checks that a test fails for every one.
 */
const file = '../src/events.ts'
const tests = ['packages/richtext-dom/test/atom.test.ts']

export default [
  {
    name: 'a press on an atom is left to the browser',
    edits: [{ file, find: "    select({ type: 'Node', node: block.id })", replace: '' }],
    tests,
  },
  {
    name: 'any button selects',
    edits: [{ file, find: 'if (event.button !== 0 || !(origin', replace: 'if (!(origin' }],
    tests,
  },
  {
    name: 'a press on text selects its block',
    edits: [
      {
        file,
        find: 'if (block === undefined || !RichText.isAtom(options.nodes, block)) return',
        replace: 'if (block === undefined) return',
      },
    ],
    tests,
  },
  {
    name: 'the range around an atom reads as text',
    edits: [
      {
        file,
        find: "  if (selected !== undefined) return { type: 'Node', node: selected }\n",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a node selection draws no range',
    edits: [
      { file, find: '    range.selectNode(element)\n    live.addRange(range)\n', replace: '' },
    ],
    tests,
  },
  {
    name: 'the mark stays when the selection moves on',
    edits: [
      {
        file,
        find: "    if (selectedBlock !== target) selectedBlock?.removeAttribute('data-selected')",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'an arrow goes the same way either side',
    edits: [
      {
        file,
        find: "      const after = key === 'ArrowRight' || key === 'ArrowDown'",
        replace: "      const after = key === 'ArrowRight' || key === 'ArrowUp'",
      },
    ],
    tests,
  },
]
