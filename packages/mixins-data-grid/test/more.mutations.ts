/**
 * `MoreOnScroll` and the More button it watches, broken in turn: `pnpm mutate
 * packages/mixins-data-grid/test/more.mutations.ts` checks that a test fails
 * for every one.
 */
const tests = ['packages/mixins-data-grid/test/more.test.ts']

export default [
  {
    name: 'a load in flight is watched anyway',
    edits: [
      {
        file: '../src/nearEnd.ts',
        find: 'if (!watching || Observer === undefined) return',
        replace: 'if (Observer === undefined) return',
      },
    ],
    tests,
  },
  {
    name: 'the button is not keyed by whether a load is in flight',
    edits: [
      {
        file: '../src/view.ts',
        find: 'h.Key(`more:${addressableRows(projection.rowCount)}:${busy}`)',
        replace: 'h.Key(`more:${addressableRows(projection.rowCount)}`)',
      },
    ],
    tests,
  },
  {
    name: 'the button is not keyed by the rows loaded',
    edits: [
      {
        file: '../src/view.ts',
        find: 'h.Key(`more:${addressableRows(projection.rowCount)}:${busy}`)',
        replace: 'h.Key(`more:${busy}`)',
      },
    ],
    tests,
  },
  {
    name: 'the Behavior watches nothing',
    edits: [
      {
        file: '../src/moreOnScroll.ts',
        find: 'Nearing({ watching: !isBusy(input.status) })',
        replace: 'Nearing({ watching: false })',
      },
    ],
    tests,
  },
]
