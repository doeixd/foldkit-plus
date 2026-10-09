/**
 * The date editor, broken in turn:
 * `pnpm mutate packages/data-grid/test/date.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = [
  'packages/data-grid/test/projection.test.ts',
  'packages/data-grid/test/grid.test.ts',
  'packages/mixins-data-grid/test/editors.test.ts',
]

export default [
  {
    name: 'no schema reads as a date',
    edits: [
      {
        file: '../src/columns.ts',
        find: 'if (isDate(type)) return CellEditor.Date()',
        replace: 'if (false) return CellEditor.Date()',
      },
    ],
    tests,
  },
  {
    name: 'a date draft begins from the long string',
    edits: [
      {
        file: '../src/grid.ts',
        find: 'return `${value.getFullYear()}-${month}-${day}`',
        replace: 'return Columns.textOf(value)',
      },
    ],
    tests,
  },
  {
    name: 'a date draft is the UTC day',
    edits: [
      {
        file: '../src/grid.ts',
        find: 'return `${value.getFullYear()}-${month}-${day}`',
        replace: 'return value.toISOString().slice(0, 10)',
      },
    ],
    tests,
  },
  {
    name: 'a date edits in a text field',
    edits: [
      {
        file: '../../mixins-data-grid/src/view.ts',
        find: "Date: () => [field(Option.none(), 'date')]",
        replace: "Date: () => [field(Option.none(), 'text')]",
      },
    ],
    tests,
  },
]
