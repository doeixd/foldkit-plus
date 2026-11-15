/**
 * The copy report as drawn: `pnpm mutate
 * packages/mixins-data-grid/test/copied.mutations.ts` checks that a test fails
 * when the view reports no copy or the wrong size.
 */
const view = '../src/view.ts'
const tests = ['packages/mixins-data-grid/test/clipboard.test.ts']

export default [
  {
    name: 'a copy is reported by its rows only',
    edits: [
      {
        file: view,
        find: '                  columns: box.columns.length,\n                }),',
        replace: '                  columns: 1,\n                }),',
      },
    ],
    tests,
  },
  {
    name: 'a copy is reported as the rows and columns swapped',
    edits: [
      {
        file: view,
        find: '                  rows: box.rows.end - box.rows.start,\n                  columns: box.columns.length,',
        replace:
          '                  rows: box.columns.length,\n                  columns: box.rows.end - box.rows.start,',
      },
    ],
    tests,
  },
  {
    name: 'a copy reports nothing',
    edits: [
      {
        file: view,
        find: '            h.OnCopy(\n              input.wrap(',
        replace: '            h.OnCopyText(\n              String(',
      },
    ],
    tests,
  },
]
