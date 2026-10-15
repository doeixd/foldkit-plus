/**
 * Select-all in code, each part broken in turn: `pnpm mutate
 * packages/richtext-dom/test/selectAll.mutations.ts` checks that a test fails for every one.
 */
const file = '../src/events.ts'
const tests = ['packages/richtext-dom/test/selectAll.test.ts']

export default [
  {
    name: 'select-all in code is the browser’s',
    edits: [{ file, find: '      if (code !== undefined) {', replace: '      if (false) {' }],
    tests,
  },
  {
    name: 'a second select-all selects the code again',
    edits: [
      {
        file,
        find: '    return sameSelection(selection, whole) ? undefined : whole',
        replace: '    return whole',
      },
    ],
    tests,
  },
  {
    name: 'select-all anywhere selects the block',
    edits: [
      {
        file,
        find: "    if (declared?.kind !== 'node' || declared.lineBreaks !== true) return undefined",
        replace: '',
      },
    ],
    tests,
  },
]
