/**
 * A list page selects each column once (#568):
 * `pnpm mutate packages/remote-drizzle/test/pageSelect.mutations.ts`.
 */
const tests = ['packages/remote-drizzle/test/pageSelect.test.ts']
const cursor = '../src/cursor.ts'

export default [
  {
    name: 'a key the page already selects is selected again',
    edits: [
      {
        file: cursor,
        find: 'const same = held.find(([, key]) => key === term.key)',
        replace: 'const same = undefined',
      },
    ],
    tests,
  },
  {
    name: 'the id is not known to the page when its keys are read back',
    edits: [
      {
        file: '../src/index.ts',
        find: 'keyCursor(keysOf(orderBy, row, own))',
        replace: 'keyCursor(keysOf(orderBy, row))',
      },
    ],
    tests,
  },
]
