/**
 * The row count while the source has not answered, broken in turn:
 * `pnpm mutate packages/mixins-data-grid/test/rowCount.mutations.ts`.
 */
const tests = ['packages/mixins-data-grid/test/status.test.ts']
const file = '../src/view.ts'

export default [
  {
    name: 'a loading grid with no rows counts none',
    edits: [
      {
        file,
        find: '            Refreshing: () => false,\n            Loading: () => true,',
        replace: '            Refreshing: () => false,\n            Loading: () => false,',
      },
    ],
    tests,
  },
  {
    name: 'a failed grid with nothing kept counts none',
    edits: [
      {
        file,
        find: '            Failed: () => true,',
        replace: '            Failed: () => false,',
      },
    ],
    tests,
  },
  {
    name: 'an empty answer being refreshed counts as unknown',
    edits: [
      {
        file,
        find: '            Refreshing: () => false,',
        replace: '            Refreshing: () => true,',
      },
    ],
    tests,
  },
  {
    name: 'known rows count as unknown while loading',
    edits: [{ file, find: '          empty &&\n', replace: '' }],
    tests,
  },
]
