/**
 * The file input section's browser claims, broken in turn: `pnpm mutate
 * examples/widgets/test/file-input.browser.mutations.ts`.
 */
const app = '../src/file-input/app.ts'
const view = '../src/file-input/view.ts'
const browser = ['examples/widgets/test/file-input.browser.test.ts']

export default [
  {
    name: 'a pick is not written back into the input',
    edits: [
      {
        file: app,
        find: '        commands: [FileInput.Sync({ id: FIELD, files: next })],',
        replace: '        commands: [],',
      },
    ],
    tests: browser,
  },
  {
    name: 'removing a row does not write the rest back',
    edits: [
      {
        file: app,
        find: 'commands: [FileInput.Sync({ id: FIELD, files: next }), FileInput.Focus({ id: FIELD })],',
        replace: 'commands: [FileInput.Focus({ id: FIELD })],',
      },
    ],
    tests: browser,
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
    tests: browser,
  },
  {
    name: 'the receipt counts the nameless part an empty input submits',
    edits: [{ file: app, find: " && entry.name !== ''", replace: '' }],
    tests: browser,
  },
  {
    name: 'the field submits under no name',
    edits: [{ file: view, find: '          name: NAME,\n', replace: '' }],
    tests: browser,
  },
]
