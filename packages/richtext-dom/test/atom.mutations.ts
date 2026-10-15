/**
 * Selecting an atom in the browser, each part broken in turn: `pnpm mutate
 * packages/richtext-dom/test/atom.mutations.ts` checks that a test fails for every one.
 */
const file = '../src/events.ts'
const tests = [
  'packages/richtext-dom/test/atom.test.ts',
  'packages/richtext-dom/test/atom.browser.test.ts',
]

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
  {
    name: 'a press on an adornment moves the caret',
    edits: [
      {
        file,
        find: '      event.preventDefault()\n      return\n    }\n    if (origin.closest(INTERACTIVE) !== null) return',
        replace: '      return\n    }\n    if (origin.closest(INTERACTIVE) !== null) return',
      },
    ],
    tests,
  },
  {
    name: 'an arrow steps over an atom',
    edits: [{ file, find: '      if (reached !== undefined) {', replace: '      if (false) {' }],
    tests,
  },
  {
    name: 'Shift and an arrow select an atom',
    edits: [
      {
        file,
        find: '    if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return undefined',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'an arrow anywhere in the text selects the atom',
    edits: [
      {
        file,
        find: '    if (offset === (after ? length : 0)) return neighbour.id',
        replace: '    return neighbour.id',
      },
    ],
    tests,
  },
  {
    name: 'Down and Up from any line select the atom',
    edits: [
      {
        file,
        find: '    return onEdgeLine ? neighbour.id : undefined',
        replace: '    return neighbour.id',
      },
    ],
    tests,
  },
  {
    name: 'an arrow from a selected atom trusts the last report',
    edits: [
      {
        file,
        find: "const live = event.type === 'keydown' && !composing ? readSelection(current) : null",
        replace: "const live = event.type === 'keydown' && !composing ? lastSelection : null",
      },
    ],
    tests,
  },
]
