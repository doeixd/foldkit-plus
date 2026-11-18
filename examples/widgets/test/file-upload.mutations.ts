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
    edits: [{ file: app, find: "accept: ['.pdf', 'image/*'], ", replace: '' }],
    tests: unit,
  },
  {
    name: 'a change to the list keeps the receipt',
    edits: [
      {
        file: app,
        find: 'return result.model.upload.entries === model.upload.entries || Option.isNone(result.model.receipt)',
        replace: 'return true',
      },
    ],
    tests: unit,
  },
  {
    name: 'a Message that changes nothing about the list still drops the receipt',
    edits: [
      {
        file: app,
        find: 'return result.model.upload.entries === model.upload.entries || Option.isNone(result.model.receipt)',
        replace: 'return Option.isNone(result.model.receipt)',
      },
    ],
    tests: unit,
  },
  {
    name: 'an unchanged Model is a new Model',
    edits: [
      {
        file: app,
        find: '    ? result\n',
        replace: '    ? { ...result, model: { ...result.model } }\n',
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
