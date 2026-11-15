/**
 * The tour section, broken in turn: `pnpm mutate
 * examples/widgets/test/tour.mutations.ts`.
 */
const app = '../src/tour/app.ts'
const view = '../src/tour/view.ts'
const unit = ['examples/widgets/test/tour.test.ts']
const browser = ['examples/widgets/test/tour.browser.test.ts']

export default [
  {
    name: 'a finished tour is said to be skipped',
    edits: [
      {
        file: app,
        find: "completed ? 'finished' : 'skipped'",
        replace: "completed ? 'skipped' : 'finished'",
      },
    ],
    tests: [...unit, ...browser],
  },
  {
    name: 'a Tour step that changes nothing rewrites the Model',
    edits: [
      { file: app, find: 'step.model === model.tour && Option.isNone(ended)', replace: 'false' },
    ],
    tests: unit,
  },
  {
    name: 'starting the tour again forgets how it last ended',
    edits: [{ file: app, find: 'Option.orElse(ended, () => ending)', replace: 'ended' }],
    tests: unit,
  },
  {
    name: 'the notes button opens nothing',
    edits: [
      {
        file: app,
        find: 'OpenedNotes: () => panelStep(model, FloatingPanel.open(model.panel)),',
        replace: 'OpenedNotes: () => ({ model }),',
      },
    ],
    tests: [...unit, ...browser],
  },
  {
    name: 'the tour gives focus back to nothing',
    edits: [{ file: view, find: '        mixins: Tour.focusReturn,\n', replace: '' }],
    tests: browser,
  },
  {
    name: 'the floating panel gives focus back to nothing',
    edits: [{ file: view, find: '        mixins: FloatingPanel.focusReturn,\n', replace: '' }],
    tests: browser,
  },
]
