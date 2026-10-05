/**
 * The grid's undo and redo keys, broken in turn: `pnpm mutate
 * packages/mixins-data-grid/test/history.mutations.ts` checks that a test fails
 * for every one.
 */
const tests = [
  'packages/data-grid/test/grid.test.ts',
  'packages/mixins-data-grid/test/editing.browser.test.ts',
]
const view = '../src/view.ts'
const grid = '../../data-grid/src/grid.ts'

export default [
  {
    name: 'the grid hears no history key',
    edits: [
      {
        file: view,
        find: 'Option.orElse(historyKey(key, modifiers), () =>',
        replace: 'Option.orElse(Option.none(), () =>',
      },
    ],
    tests,
  },
  {
    name: 'Shift+Z undoes',
    edits: [
      {
        file: view,
        find: 'modifiers.shiftKey ? grid.Message.RedoRequested()',
        replace: 'false ? grid.Message.RedoRequested()',
      },
    ],
    tests,
  },
  {
    name: 'Ctrl+Y is no redo',
    edits: [
      {
        file: view,
        find: "return pressed === 'y' && !modifiers.shiftKey",
        replace: 'return false',
      },
    ],
    tests,
  },
  {
    name: 'an open edit gives up its undo key',
    edits: [
      {
        file: grid,
        find: 'Option.isSome(model.editing) ? { model } : { model, outMessage: Out.UndoRequested() }',
        replace: '({ model, outMessage: Out.UndoRequested() })',
      },
    ],
    tests,
  },
  {
    name: 'an open edit gives up its redo key',
    edits: [
      {
        file: grid,
        find: 'Option.isSome(model.editing) ? { model } : { model, outMessage: Out.RedoRequested() }',
        replace: '({ model, outMessage: Out.RedoRequested() })',
      },
    ],
    tests,
  },
]
