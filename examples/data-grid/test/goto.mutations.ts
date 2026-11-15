/** `pnpm mutate examples/data-grid/test/goto.mutations.ts`: Go to row, broken in turn. */
const tests = ['examples/data-grid/test/goto.test.ts']
const file = '../src/main.ts'

export default [
  {
    name: 'rows count from zero',
    edits: [{ file, find: 'rows.keyAt(wanted - 1)', replace: 'rows.keyAt(wanted)' }],
    tests,
  },
  {
    name: 'the keyboard stays where it was',
    edits: [{ file, find: 'FocusRow({ row })', replace: 'FocusRow({ row: "" })' }],
    tests,
  },
  {
    name: 'a repeated typing writes a new Model',
    edits: [{ file, find: 'text === model.goTo ? { model } :', replace: 'false ? { model } :' }],
    tests,
  },
]
