/**
 * The window list island, broken in turn:
 * `pnpm mutate examples/widgets/test/window-list.mutations.ts`.
 */
const app = '../src/window-list/app.ts'
const view = '../src/window-list/view.ts'
const unit = ['examples/widgets/test/window-list.test.ts']

export default [
  {
    name: 'an unchanged list makes a new Model',
    edits: [{ file: app, find: 'next.model === model.list ? model : ', replace: '' }],
    tests: unit,
  },
  {
    name: 'two names are the same',
    edits: [
      {
        file: app,
        find: 'Math.floor(index / WORDS.length) + 1',
        replace: 'Math.floor(index / (WORDS.length * 2)) + 1',
      },
    ],
    tests: unit,
  },
  {
    name: 'the list is given no way to ask for a reveal',
    edits: [
      { file: app, find: 'commands: inList(next.commands ?? []),', replace: 'commands: [],' },
    ],
    tests: unit,
  },
  {
    name: 'a row number past the list is revealed',
    edits: [{ file: app, find: ' && number <= NAMES.length', replace: '' }],
    tests: unit,
  },
  {
    name: 'a row number below the first is revealed',
    edits: [{ file: app, find: 'number >= 1 && ', replace: '' }],
    tests: unit,
  },
  {
    name: 'the row revealed is the one after the number typed',
    edits: [{ file: app, find: 'model.list, number - 1,', replace: 'model.list, number,' }],
    tests: unit,
  },
  {
    name: 'the row is revealed at the start, under the sticky heading',
    edits: [{ file: app, find: "'center'", replace: "'start'" }],
    tests: unit,
  },
  {
    name: 'typing does not reach the Model',
    edits: [{ file: view, find: 'h.OnInput(text => Message.ChangedRow({ text })),', replace: '' }],
    tests: unit,
  },
]
