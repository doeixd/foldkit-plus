/**
 * The spatial section, broken in turn: `pnpm mutate
 * examples/authoring/test/spatial.mutations.ts`.
 */
const app = '../src/spatial/app.ts'
const view = '../src/spatial/view.ts'
const unit = 'examples/authoring/test/spatial.test.ts'
const page = 'examples/authoring/test/spatial.browser.test.ts'

export default [
  {
    name: 'a lasso always adds to the selection before it',
    edits: [
      {
        file: app,
        find: '            Marquee.selected(lasso.before, { ids, additive }),\n            Option.some',
        replace:
          '            Marquee.selected(lasso.before, { ids, additive: true }),\n            Option.some',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a lasso that ends forgets what a Shift lasso keeps',
    edits: [
      {
        file: app,
        find: 'selectWith(model, Marquee.selected(lasso.before, { ids, additive }), Option.none())',
        replace: 'selectWith(model, ids, Option.none())',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a cancelled lasso keeps what it selected',
    edits: [
      {
        file: app,
        find: 'selectWith(model, lasso.before, Option.none())',
        replace: 'selectWith(model, model.picks.selected, Option.none())',
      },
    ],
    tests: [unit],
  },
  {
    name: 'Escape in a lasso keeps what it selected, on the page',
    edits: [
      {
        file: app,
        find: 'selectWith(model, lasso.before, Option.none())',
        replace: 'selectWith(model, model.picks.selected, Option.none())',
      },
    ],
    tests: [page],
  },
  {
    name: 'an unchanged count is read again',
    edits: [
      {
        file: app,
        find: 'model.picks.selected.length === model.told',
        replace: 'false',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a lasso is not announced',
    edits: [
      {
        file: app,
        find: '    Selected.helpers.replace(ids),\n    announced,\n',
        replace: '    Selected.helpers.replace(ids),\n',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a lasso is not announced, on the page',
    edits: [
      {
        file: app,
        find: '    Selected.helpers.replace(ids),\n    announced,\n',
        replace: '    Selected.helpers.replace(ids),\n',
      },
    ],
    tests: [page],
  },
  {
    name: 'a click is not announced',
    edits: [
      {
        file: app,
        find: 'onMessage: () => announced',
        replace: 'onMessage: () => (model: Model) => ({ model })',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a key is not announced, on the page',
    edits: [
      {
        file: app,
        find: 'onMessage: () => announced',
        replace: 'onMessage: () => (model: Model) => ({ model })',
      },
    ],
    tests: [page],
  },
  {
    name: 'a clear is not announced',
    edits: [
      {
        file: app,
        find: 'Update.combine(model, [Selected.helpers.clear(), announced])',
        replace: 'Selected.helpers.clear()(model)',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the lasso rectangle is not drawn',
    edits: [
      {
        file: view,
        find: '...Option.match(model.lasso, {',
        replace: '...Option.match(Option.filter(model.lasso, () => false), {',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the arrows are not wired',
    edits: [{ file: view, find: '  Behavior.attach(Arrows),\n', replace: '' }],
    tests: [page],
  },
  {
    name: 'the lasso is not wired',
    edits: [{ file: view, find: '  Behavior.attach(Lassos),\n', replace: '' }],
    tests: [page],
  },
  {
    name: 'a click does not select',
    edits: [{ file: view, find: '  Behavior.attach(Picked),\n', replace: '' }],
    tests: [page],
  },
]
