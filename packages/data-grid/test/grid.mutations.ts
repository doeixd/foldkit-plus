/**
 * The grid's unchanged-edit and paste rules, each broken in turn: `pnpm mutate packages/data-grid/test/grid.mutations.ts` checks that a
 * test fails for every one.
 */
export default [
  {
    name: 'text only, no decoded comparison',
    edits: [
      {
        file: '../src/grid.ts',
        find: '    text === from ||\n    Option.exists(',
        replace: '    text === from ||\n    false && Option.exists(',
      },
    ],
    tests: ['packages/data-grid', 'examples/registry/test/page.test.ts', 'examples/data-grid'],
  },
  {
    name: 'an unchanged commit is reported',
    edits: [
      {
        file: '../src/grid.ts',
        find: '        if (unchanged(address.column, from, draft)) {',
        replace: '        if (false) {',
      },
    ],
    tests: ['packages/data-grid', 'examples/registry/test/page.test.ts', 'examples/data-grid'],
  },
  {
    name: "unchanged judged after the column's error",
    edits: [
      {
        file: '../src/grid.ts',
        find: '        if (unchanged(address.column, from, draft)) {',
        replace:
          '        if (Option.isNone(errorOf(address.column, draft)) && unchanged(address.column, from, draft)) {',
      },
    ],
    tests: ['packages/data-grid', 'examples/registry/test/page.test.ts', 'examples/data-grid'],
  },
  {
    name: "a typed key replaces the open edit's from",
    edits: [
      {
        file: '../src/grid.ts',
        find: 'onSome: open => ({ ...open, draft: open.draft + text, error: Option.none() }),',
        replace:
          'onSome: open => ({ ...open, from, draft: open.draft + text, error: Option.none() }),',
      },
    ],
    tests: ['packages/data-grid', 'examples/registry/test/page.test.ts', 'examples/data-grid'],
  },
  {
    name: 'a paste keeps unchanged cells',
    edits: [
      {
        file: '../src/grid.ts',
        find: '            if (unchanged(cell.column, from, cell.text)) continue\n',
        replace: '',
      },
    ],
    tests: ['packages/data-grid', 'examples/registry/test/page.test.ts', 'examples/data-grid'],
  },
  {
    name: 'a paste that changes nothing is reported',
    edits: [
      {
        file: '../src/grid.ts',
        find: '          return accepted.length === 0 && refused.length === 0',
        replace: '          return false',
      },
    ],
    tests: ['packages/data-grid', 'examples/registry/test/page.test.ts', 'examples/data-grid'],
  },
  {
    name: 'pasted cells read from at the anchor',
    edits: [
      {
        file: '../src/clipboard.ts',
        find: 'from: cells.from({ row, column })',
        replace: 'from: cells.from(anchor)',
      },
    ],
    tests: ['packages/data-grid', 'examples/registry/test/page.test.ts', 'examples/data-grid'],
  },
]
