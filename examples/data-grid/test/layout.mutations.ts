/**
 * The saved column layout, broken in turn: `pnpm mutate
 * examples/data-grid/test/layout.mutations.ts` checks that a test fails for every one.
 */
const tests = ['examples/data-grid/test/layout.test.ts']
const file = '../src/main.ts'

export default [
  {
    name: 'nothing is saved',
    edits: [
      {
        file,
        find: 'return next.model.grid.columns === model.grid.columns',
        replace: 'return true',
      },
    ],
    tests,
  },
  {
    name: 'every transition saves',
    edits: [
      {
        file,
        find: 'return next.model.grid.columns === model.grid.columns',
        replace: 'return false',
      },
    ],
    tests,
  },
  {
    name: 'a saved layout is not read back',
    edits: [
      {
        file,
        find: 'columns: () => Grid.columnState.restore(layout).state',
        replace: 'columns: columns => columns',
      },
    ],
    tests,
  },
]
