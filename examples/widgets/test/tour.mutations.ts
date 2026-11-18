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
    name: 'a later ending does not replace the first',
    edits: [
      {
        file: app,
        find: 'ending: () => Option.some<Ending>(completed ? ',
        replace: 'ending: ending => Option.orElse(ending, () => Option.some<Ending>(completed ? ',
      },
      {
        file: app,
        find: "'finished' : 'skipped'),",
        replace: "'finished' : 'skipped')),",
      },
    ],
    tests: unit,
  },
  {
    name: 'the notes button opens nothing',
    edits: [
      {
        file: app,
        find: 'OpenedNotes: () => panel.helpers.open()(model),',
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
