/**
 * A Shift press's row range, each step broken in turn:
 * `pnpm mutate packages/data-grid/test/rowRange.mutations.ts` checks that a
 * test fails for every one.
 */
const file = '../src/grid.ts'
const tests = [
  'packages/data-grid/test/grid.test.ts',
  'packages/mixins-data-grid/test/selection.test.ts',
]

export default [
  {
    name: 'a Shift press asks for no rows',
    edits: [
      {
        file,
        find: "    if (shiftKey && options.rowSelection === 'multiple') {",
        replace: "    if (false && options.rowSelection === 'multiple') {",
      },
    ],
    tests,
  },
  {
    name: 'a Shift press spans rows where it should span cells',
    edits: [
      {
        file,
        find: '    if (shiftKey && options.cellSelection === true) {',
        replace: '    if (false && options.cellSelection === true) {',
      },
    ],
    tests,
  },
  {
    name: 'the range ignores the anchor',
    edits: [
      {
        file,
        find: '        Option.orElse(model.selection.anchor, () =>',
        replace: '        Option.orElse(Option.none<string>(), () =>',
      },
    ],
    tests,
  },
  {
    name: 'the range ignores the focused row',
    edits: [
      {
        file,
        find: '          Option.map(model.focus.current, current => current.row),',
        replace: '          Option.none<string>(),',
      },
    ],
    tests,
  },
  {
    name: 'a Shift press leaves focus where it was',
    edits: [
      {
        file,
        find: '        ? focused\n',
        replace: '        ? model\n',
      },
    ],
    tests,
  },
  {
    name: 'extendRows adds the ends only',
    edits: [
      {
        file,
        find: '        rows: GridSelection.rowsBetween(project(rows, model.columns), request.from, request.to),',
        replace: '        rows: [request.from, request.to],',
      },
    ],
    tests,
  },
  {
    name: 'a first Shift press anchors at the row clicked',
    edits: [
      {
        file,
        find: 'anchor: Option.some(from) })',
        replace: 'anchor: Option.some(address.row) })',
      },
    ],
    tests,
  },
]
