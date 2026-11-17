/**
 * The file upload section, broken in turn: `pnpm mutate
 * examples/widgets/test/file-upload.mutations.ts`.
 */
const app = '../src/file-upload/app.ts'
const view = '../src/file-upload/view.ts'
const unit = ['examples/widgets/test/file-upload.test.ts']
const browser = ['examples/widgets/test/file-upload.browser.test.ts']

export default [
  {
    name: 'the widget is given no limits on its kinds',
    edits: [{ file: app, find: "accept: ['.pdf', 'image/*'],", replace: '' }],
    tests: unit,
  },
  {
    name: 'a change to the list keeps the receipt',
    edits: [
      {
        file: app,
        find: 'upload.entries === model.upload.entries ? receipt : Option.none()',
        replace: 'receipt',
      },
    ],
    tests: unit,
  },
  {
    name: 'an unchanged widget Model is a new Model',
    edits: [
      {
        file: app,
        find: 'upload === model.upload\n            ? model',
        replace: 'false\n            ? model',
      },
    ],
    tests: unit,
  },
  {
    name: 'a submit does not read the form',
    edits: [
      {
        file: app,
        find: 'Submitted: () => ({ model, commands: [ReadSubmission({ form: FORM })] }),',
        replace: 'Submitted: () => ({ model }),',
      },
    ],
    tests: unit,
  },
  {
    name: 'the field submits under no name',
    edits: [{ file: view, find: 'name: NAME,', replace: '' }],
    tests: browser,
  },
]
