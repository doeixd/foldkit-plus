/**
 * The file input section, broken in turn: `pnpm mutate
 * examples/widgets/test/file-input.mutations.ts`; the browser's share is in
 * `file-input.browser.mutations.ts`.
 */
const app = '../src/file-input/app.ts'
const view = '../src/file-input/view.ts'
const unit = ['examples/widgets/test/file-input.test.ts']

export default [
  {
    name: 'removing a row does not write the rest back',
    edits: [
      {
        file: app,
        find: 'commands: [FileInput.Sync({ id: FIELD, files: next }), FileInput.Focus({ id: FIELD })],',
        replace: 'commands: [FileInput.Focus({ id: FIELD })],',
      },
    ],
    tests: unit,
  },
  {
    name: 'removing a row does not return focus to the field',
    edits: [
      {
        file: app,
        find: 'commands: [FileInput.Sync({ id: FIELD, files: next }), FileInput.Focus({ id: FIELD })],',
        replace: 'commands: [FileInput.Sync({ id: FIELD, files: next })],',
      },
    ],
    tests: unit,
  },
  {
    name: 'a pick is not written back into the input',
    edits: [
      {
        file: app,
        find: '        commands: [FileInput.Sync({ id: FIELD, files: next })],',
        replace: '        commands: [],',
      },
    ],
    tests: unit,
  },
  {
    name: 'a pick writes back the list as it was',
    edits: [
      {
        file: app,
        find: '        commands: [FileInput.Sync({ id: FIELD, files: next })],',
        replace: '        commands: [FileInput.Sync({ id: FIELD, files: model.files })],',
      },
    ],
    tests: unit,
  },
  {
    name: 'picks replace the list instead of joining it',
    edits: [{ file: app, find: '{ multiple: true }', replace: '{}' }],
    tests: unit,
  },
  {
    name: 'a pick keeps the receipt of the last submit',
    edits: [
      {
        file: app,
        find: 'modifyFields(model, { files: () => next, receipt: () => Option.none() }),\n        commands: [FileInput.Sync({ id: FIELD, files: next })],',
        replace:
          'modifyFields(model, { files: () => next }),\n        commands: [FileInput.Sync({ id: FIELD, files: next })],',
      },
    ],
    tests: unit,
  },
  {
    name: 'a submit reads nothing from the form',
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
    name: 'a remove button names the wrong file',
    edits: [
      {
        file: view,
        find: 'onRemove: file => Message.Removed({ file }),',
        replace: 'onRemove: () => Message.Removed({ file: new File([], "other") }),',
      },
    ],
    tests: unit,
  },
]
