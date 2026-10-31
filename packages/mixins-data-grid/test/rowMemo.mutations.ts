/**
 * The body rows' memo: `pnpm mutate packages/mixins-data-grid/test/rowMemo.mutations.ts`.
 */
const tests = ['packages/mixins-data-grid/test/rowMemo.test.ts']

export default [
  {
    name: 'every row is drawn on every render',
    edits: [
      {
        file: '../src/view.ts',
        find: 'slots.row.lazy({ index, id: key }, drawRow, {',
        replace: 'drawRow(slots, h, {',
      },
    ],
    tests,
  },
  {
    name: 'a row is not told where the focus is',
    edits: [
      {
        file: '../src/view.ts',
        find: `                  focused: Option.isNone(onHeader)
                    ? Option.map(`,
        replace: `                  focused: Option.isSome(onHeader)
                    ? Option.map(`,
      },
    ],
    tests,
  },
  {
    name: 'a layout reading the same is made again',
    edits: [
      {
        file: '../src/view.ts',
        find: 'if (lastLayout !== undefined && lastLayout.text === text) return lastLayout.layout',
        replace:
          'if (lastLayout === undefined && lastLayout!.text === text) return lastLayout!.layout',
      },
    ],
    tests,
  },
  {
    name: 'the first layout is kept whatever the columns become',
    edits: [
      {
        file: '../src/view.ts',
        find: 'if (lastLayout !== undefined && lastLayout.text === text) return lastLayout.layout',
        replace: 'if (lastLayout !== undefined) return lastLayout.layout',
      },
    ],
    tests,
  },
]
