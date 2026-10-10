/**
 * The registry's own guards, each broken in turn: `pnpm mutate
 * examples/registry/test/registry.mutations.ts` checks that a test fails for
 * every one. The edit rules themselves are `foldkit-sync/entity`'s, and
 * `packages/sync/test/entity.mutations.ts` breaks those.
 */
const tests = ['examples/registry/test/page.test.ts']

export default [
  {
    name: 'a newly held edit asks for no read',
    edits: [
      {
        file: '../src/app.ts',
        find: 'return shown.held.length === 0 ? next : Products.refresh(next)',
        replace: 'return next',
      },
    ],
    tests,
  },
  {
    name: 'the overlays never follow the edits',
    edits: [
      {
        file: '../src/sync.ts',
        find: 'afterUpdate: model => ({ model: shownWith(model) }),',
        replace: 'afterUpdate: model => ({ model }),',
      },
    ],
    tests,
  },
  {
    name: 'a reset reads no rows again',
    edits: [{ file: '../src/sync.ts', find: 'if (reset) return', replace: 'if (false) return' }],
    tests,
  },
  {
    name: 'a reset keeps the overlays it had',
    edits: [
      {
        file: '../src/sync.ts',
        find: 'Products.refresh(Shown.clear(next))',
        replace: 'Products.refresh(next)',
      },
    ],
    tests,
  },
  {
    name: 'a settled replacement is not said',
    edits: [
      {
        file: '../src/app.ts',
        find: '...shown.replaced.map(edit => replacementOf({ edit, by: Option.none() })),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the replica is never named',
    edits: [
      {
        file: '../src/sync.ts',
        find: 'mounted.dispatch(Message.ReplicaNamed({ replica: replica.replicaId }))',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a replacement in the slice is not said',
    edits: [
      {
        file: '../src/app.ts',
        find: 'ProductEdits.replaced(previous.edits, next.edits, next.replica).map(replacementOf)',
        replace: '[]',
      },
    ],
    tests,
  },
  {
    name: 'a refusal names no cell',
    edits: [
      {
        file: '../src/sync.ts',
        find: 'ProductEdits.cellsOf(changes).map(({ id, member }) => ({ id, column: member })),',
        replace: '[],',
      },
    ],
    tests,
  },
  {
    name: 'an edit to a product the table has not got commits',
    edits: [
      {
        file: '../src/journal.ts',
        find: "    if (missing) throw new Error('An edit names a product the table has not got')",
        replace: '',
      },
    ],
    tests: ['examples/registry/test/journal.test.ts'],
  },
  {
    name: 'an edit leaves nothing to undo',
    edits: [
      {
        file: '../src/app.ts',
        find: 'undo: undo => (step.length === 0 ? undo : [...undo, step].slice(-UNDO_DEPTH)),',
        replace: 'undo: undo => undo,',
      },
    ],
    tests,
  },
  {
    name: 'a new edit keeps the redo stack',
    edits: [{ file: '../src/app.ts', find: '      redo: () => [],\n', replace: '' }],
    tests,
  },
  {
    name: 'an undo overwrites a cell changed since',
    edits: [
      {
        file: '../src/app.ts',
        find: 'const taken = step.filter(cell => holds(cell.after))',
        replace: 'const taken = step',
      },
    ],
    tests,
  },
  {
    name: 'a cell left alone is not said',
    edits: [
      { file: '../src/app.ts', find: '        left.length === 0\n', replace: '        true\n' },
    ],
    tests,
  },
  {
    name: 'a step is moved to the other stack unflipped',
    edits: [
      {
        file: '../src/app.ts',
        find: "[...other, by === 'undo' ? taken : flipped(taken)]",
        replace: '[...other, taken]',
      },
    ],
    tests,
  },
  {
    name: 'a step taken back stays on its stack',
    edits: [
      {
        file: '../src/app.ts',
        find: 'const popped = from.slice(0, -1)',
        replace: 'const popped = from',
      },
    ],
    tests,
  },
  {
    name: 'an undo sends the value it takes back',
    edits: [
      {
        file: '../src/app.ts',
        find: 'taken.map(cell => cell.before)',
        replace: 'taken.map(cell => cell.after)',
      },
    ],
    tests,
  },
  {
    name: 'the panel has one section for every owner',
    edits: [
      {
        file: '../src/ownership.ts',
        find: 'const name = ownerName(owner)',
        replace: "const name = 'This page'",
      },
    ],
    tests,
  },
  {
    name: 'a field no contract claims is left out',
    edits: [
      {
        file: '../src/ownership.ts',
        find: "? 'This page'",
        replace: "? ''",
      },
    ],
    tests,
  },
  {
    name: 'committed edits are counted as not yet sent',
    edits: [
      {
        file: '../src/ownership.ts',
        find: 'model.edits.filter(edit => Option.isNone(edit.at))',
        replace: 'model.edits',
      },
    ],
    tests,
  },
  {
    name: 'rows drawn counts from the first row',
    edits: [
      {
        file: '../src/view.ts',
        find: '(shown.rows.end - shown.rows.start)',
        replace: '(shown.rows.end)',
      },
    ],
    tests,
  },
  {
    name: 'rows drawn is the view’s own guess',
    edits: [
      {
        file: '../src/view.ts',
        find: '  const shown = Grid.window(geometry)\n',
        replace:
          '  const shown = Grid.window({ ...geometry, overscan: { rows: 0, columns: 0 } })\n',
      },
    ],
    tests,
  },
  {
    name: 'a fill writes nothing',
    edits: [
      {
        file: '../src/app.ts',
        find: 'Filled: request => edited(model, Grid.fill(rowsOf(model), model.grid, request).accepted),',
        replace: 'Filled: () => edited(model, []),',
      },
    ],
    tests,
  },
  {
    name: 'the search is not the query’s input',
    edits: [
      {
        file: '../src/app.ts',
        find: 'Option.some({ sort: model.sort, search: model.search })',
        replace: "Option.some({ sort: model.sort, search: '' })",
      },
    ],
    tests,
  },
  {
    name: 'the server does not filter by the search',
    edits: [
      {
        file: '../src/operations.ts',
        find: 'Expr.contains(Registry.Product.fields.description, input.search)',
        replace: "Expr.contains(Registry.Product.fields.description, '')",
      },
    ],
    tests,
  },
]
