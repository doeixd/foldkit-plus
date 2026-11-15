/** `pnpm mutate examples/data-grid/test/filters.mutations.ts`: each break is caught by the update test. */
const tests = ['examples/data-grid/test/filters.test.ts']
const file = '../src/main.ts'

export default [
  {
    name: 'clearing leaves the filters on',
    edits: [
      { file, find: 'filters: () => Grid.noFilters,', replace: 'filters: filters => filters,' },
    ],
    tests,
  },
  {
    name: 'clearing with none on writes a new Model',
    edits: [
      {
        file,
        find: '          : { model },\n    }),\n    Match.exhaustive,',
        replace: '          : { model: { ...model } },\n    }),\n    Match.exhaustive,',
      },
    ],
    tests,
  },
]
