/**
 * The application-keys section, broken in turn: `pnpm mutate
 * examples/widgets/test/app-keys.mutations.ts`.
 */
const app = '../src/app-keys/app.ts'
const view = '../src/app-keys/view.ts'
const unit = ['examples/widgets/test/app-keys.test.ts']
const browser = ['examples/widgets/test/app-keys.browser.test.ts']

export default [
  {
    name: 'the Command is given no application route for Escape',
    edits: [
      {
        file: view,
        find: 'commandOf(model, [clearOnEscape, lastRow], h)',
        replace: 'commandOf(model, [lastRow], h)',
      },
    ],
    tests: unit,
  },
  {
    name: 'the Command is given no application route for Escape (in the browser)',
    edits: [
      {
        file: view,
        find: 'commandOf(model, [clearOnEscape, lastRow], h)',
        replace: 'commandOf(model, [lastRow], h)',
      },
    ],
    tests: browser,
  },
  {
    name: 'End moves to the first row instead of the last',
    edits: [{ file: view, find: 'input.rows.at(-1)', replace: 'input.rows.at(0)' }],
    tests: unit,
  },
  {
    name: 'End moves to the first row instead of the last (in the browser)',
    edits: [{ file: view, find: 'input.rows.at(-1)', replace: 'input.rows.at(0)' }],
    tests: browser,
  },
  {
    name: 'the bar route sends Home instead of End',
    edits: [
      {
        file: view,
        find: "Menubar.Message.Pressed({ key: 'End' })",
        replace: "Menubar.Message.Pressed({ key: 'Home' })",
      },
    ],
    tests: browser,
  },
  {
    name: 'the bar is given no application route',
    edits: [{ file: view, find: 'barOf(model, [lastMenu], h)', replace: 'barOf(model, [], h)' }],
    tests: browser,
  },
  {
    name: 'the Command’s refused route is on a key it does not own',
    edits: [
      {
        file: view,
        find: "on: [Keys.chord('ArrowDown')],",
        replace: "on: [Keys.chord('F2')],",
      },
    ],
    tests: unit,
  },
  {
    name: 'the Command’s refused route is on a key it does not own (in the browser)',
    edits: [
      {
        file: view,
        find: "on: [Keys.chord('ArrowDown')],",
        replace: "on: [Keys.chord('F2')],",
      },
    ],
    tests: browser,
  },
  {
    name: 'the refusals are not drawn',
    edits: [
      { file: view, find: 'clashes.map(text =>', replace: 'clashes.slice(0, 0).map(text =>' },
    ],
    tests: unit,
  },
  {
    name: 'the refusals are not drawn (in the browser)',
    edits: [
      { file: view, find: 'clashes.map(text =>', replace: 'clashes.slice(0, 0).map(text =>' },
    ],
    tests: browser,
  },
  {
    name: 'clearing an empty field makes a new Model',
    edits: [
      {
        file: app,
        find: "model.query === '' ? { model } : { model: modifyFields(model, { query: () => '' }) },",
        replace: "{ model: modifyFields(model, { query: () => '' }) },",
      },
    ],
    tests: unit,
  },
  {
    name: 'moving to the row already highlighted makes a new Model',
    edits: [
      {
        file: app,
        find: 'Option.exists(model.active, active => active === value)',
        replace: 'false',
      },
    ],
    tests: unit,
  },
  {
    name: 'a bar Message with no row forgets the last choice',
    edits: [
      {
        file: app,
        find: 'chose: current => (Option.isSome(chose) ? chose : current),',
        replace: 'chose: () => chose,',
      },
    ],
    tests: unit,
  },
  {
    name: 'a bar Message that changes nothing makes a new Model',
    edits: [
      {
        file: app,
        find: 'next.model === model.bar && Option.isNone(chose) && commands.length === 0',
        replace: 'false',
      },
    ],
    tests: unit,
  },
]
