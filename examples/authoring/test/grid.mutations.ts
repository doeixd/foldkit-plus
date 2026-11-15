/**
 * The file grid, broken in turn: `pnpm mutate
 * examples/authoring/test/grid.mutations.ts`.
 */
const app = '../src/grid/app.ts'
const view = '../src/grid/view.ts'
const gridNavigation = '../../../packages/primitives/src/interaction/grid-navigation.ts'
const unit = 'examples/authoring/test/grid.test.ts'
const page = 'examples/authoring/test/grid.browser.test.ts'

export default [
  {
    name: 'a plain choice adds to what was chosen',
    edits: [
      {
        file: app,
        find: 'return Picked.helpers.select(id)(model)',
        replace: 'return Picked.helpers.activate(id)(model)',
      },
    ],
    tests: [unit, page],
  },
  {
    name: 'a range is read from the first five rows only',
    edits: [
      {
        file: app,
        find: 'range(id, rows.ids)',
        replace: 'range(id, rows.ids.slice(0, 5))',
      },
    ],
    tests: [unit, page],
  },
  {
    name: 'a toggle replaces',
    edits: [
      { file: app, find: 'if (toggle) return Picked.helpers.activate(id)(model)', replace: '' },
    ],
    tests: [unit, page],
  },
  {
    name: 'a click ignores the Shift it was made with',
    edits: [{ file: view, find: 'shift: event.shiftKey,', replace: 'shift: false,' }],
    tests: [page],
  },
  {
    name: 'a click ignores the Ctrl it was made with',
    edits: [
      { file: view, find: 'toggle: event.ctrlKey || event.metaKey,', replace: 'toggle: false,' },
    ],
    tests: [page],
  },
  {
    name: 'Shift+arrow extends toward the wrong row',
    edits: [
      {
        file: view,
        find: "key === 'ArrowDown' ? 1 : -1",
        replace: "key === 'ArrowDown' ? -1 : 1",
      },
    ],
    tests: [page],
  },
  {
    name: 'Space ignores the modifiers it was pressed with',
    edits: [
      {
        file: view,
        find: 'Message.Chose({ id, shift: modifiers.shiftKey, toggle: modifiers.ctrlKey }),',
        replace: 'Message.Chose({ id, shift: false, toggle: false }),',
      },
    ],
    tests: [page],
  },
  {
    name: 'Ctrl+A chooses nothing',
    edits: [{ file: app, find: 'Picked.helpers.replace(rows.ids)(model)', replace: '({ model })' }],
    tests: [unit, page],
  },
  {
    name: 'PageDown moves one row',
    edits: [
      {
        file: gridNavigation,
        find: 'current + options.page * columns)',
        replace: 'current + columns)',
      },
    ],
    tests: [page],
  },
  {
    name: 'PageDown near the end does not land on the last row',
    edits: [
      {
        file: gridNavigation,
        find: 'const landing = down\n      ? Math.min(bottom, current + options.page * columns)',
        replace: 'const landing = down\n      ? current + options.page * columns',
      },
    ],
    tests: [page],
  },
]
