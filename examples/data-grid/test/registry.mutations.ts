/**
 * The registry's window and pinned column, broken in turn: `pnpm mutate
 * examples/data-grid/test/registry.mutations.ts` checks that the browser test
 * fails for every one.
 */
const tests = ['examples/data-grid/test/registry.browser.test.ts']
const file = '../src/main.ts'

export default [
  {
    name: 'the UPC scrolls away with the rest',
    edits: [{ file, find: "pinned: 'start',", replace: '' }],
    tests,
  },
  {
    name: 'far more rows than the window are drawn',
    edits: [{ file, find: 'overscan: { rows: 6,', replace: 'overscan: { rows: 60,' }],
    tests,
  },
]
