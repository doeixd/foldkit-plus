/**
 * All Results and the reads of its rows (phase 3), broken in turn:
 * `pnpm mutate examples/foldkit/domains-plus/test/results.mutations.ts`.
 * The 320px test in `e2e/dev.e2e.ts` runs its own Vite dev server, which
 * these edits do not reach; with `onSome: () => []` made by hand it fails.
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
        find: 'WindowList.keep(list, Option.match(label, { onNone: () => [], onSome: namesOf })),',
        replace: 'list,',
      },
    ],
    tests,
  },
  {
    name: 'a settled label drops the heights of its own rows, measured as it was typed',
    edits: [
      { file: '../src/client/app.ts', find: 'onSome: namesOf })', replace: 'onSome: () => [] })' },
    ],
    tests,
  },
  {
    name: 'rows not yet measured keep the desktop estimate on a phone',
    edits: [
      { file: '../src/client/resultsList.ts', find: "    unmeasured: 'mean',\n", replace: '' },
    ],
    tests,
  },
]
