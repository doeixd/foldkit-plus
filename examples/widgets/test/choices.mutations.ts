/**
 * The choices section, broken in turn: `pnpm mutate
 * examples/widgets/test/choices.mutations.ts`.
 */
const app = '../src/choices/app.ts'
const view = '../src/choices/view.ts'
const unit = ['examples/widgets/test/choices.test.ts']
const browser = ['examples/widgets/test/choices.browser.test.ts']

export default [
  {
    name: 'picking the chosen size makes a new Model',
    edits: [
      {
        file: app,
        find: 'value === model.size ? { model } :',
        replace: 'false ? { model } :',
      },
    ],
    tests: unit,
  },
  {
    name: 'the style toggle treats the group as a single choice',
    edits: [{ file: app, find: '{ multiple: true }', replace: '{ multiple: false }' }],
    tests: unit,
  },
  {
    name: 'the live steps are not counted',
    edits: [{ file: app, find: 'moves: moves => moves + 1', replace: 'moves: moves => moves' }],
    tests: unit,
  },
  {
    name: 'a step already taken makes a new Model',
    edits: [{ file: app, find: 'value === model.live', replace: 'false' }],
    tests: unit,
  },
  {
    name: 'a commit leaves the committed value where it was',
    edits: [
      {
        file: app,
        find: 'committed: () => value,',
        replace: 'committed: () => model.committed,',
      },
    ],
    tests: unit,
  },
  {
    name: 'the readout draws the committed value as the live one',
    edits: [
      {
        file: view,
        find: '`Live: ${model.live} (steps ${model.moves})`',
        replace: '`Live: ${model.committed} (steps ${model.moves})`',
      },
    ],
    tests: unit,
  },
  {
    name: 'the style group is a single choice',
    edits: [{ file: view, find: 'multiple: true,', replace: 'multiple: false,' }],
    tests: unit,
  },
  {
    name: 'the style group is a single choice (in the browser)',
    edits: [{ file: view, find: 'multiple: true,', replace: 'multiple: false,' }],
    tests: browser,
  },
  {
    name: 'the slider sends no commit',
    edits: [
      {
        file: view,
        find: 'onCommit: value => Message.Committed({ value }),',
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'the size group is drawn as pressed buttons, not a radio group',
    edits: [{ file: view, find: "id: 'size',", replace: "multiple: true,\n          id: 'size'," }],
    tests: browser,
  },
]
