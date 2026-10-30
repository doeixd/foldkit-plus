/**
 * All Results and the reads of its rows (phase 3), broken in turn:
 * `pnpm mutate examples/foldkit/domains-plus/test/results.mutations.ts`.
 */
const tests = ['examples/foldkit/domains-plus/test/results.test.ts']

export default [
  {
    name: 'the rows in view are not read',
    edits: [
      {
        file: '../src/client/app.ts',
        find: 'return Array.flatMap(groups.slice(start, end), group => group.listings.map(({ name }) => name))',
        replace: 'return []',
      },
    ],
    tests,
  },
  {
    name: 'the rows past the window are read too',
    edits: [
      {
        file: '../src/client/app.ts',
        find: 'groups.slice(start, end)',
        replace: 'groups.slice(0, end + 20)',
      },
    ],
    tests,
  },
  {
    name: 'a top name in view is read twice',
    edits: [{ file: '../src/client/app.ts', find: 'Array.dedupe([', replace: '([' }],
    tests,
  },
  {
    name: "a new search keeps the last one's heights",
    edits: [
      {
        file: '../src/client/app.ts',
        find: 'resultsList: list => WindowList.keep(list, keys),',
        replace: '',
      },
    ],
    tests,
  },
]
