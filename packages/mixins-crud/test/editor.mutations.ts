/**
 * `EditorView` and `ConfirmView`, broken in turn: `pnpm mutate packages/mixins-crud/test/editor.mutations.ts`.
 * Focus into the editor and back to its opener is the Dialog's own (`@foldkit/ui`),
 * so no edit here can remove it; `editorDialog.browser.test.ts` shows the editor
 * keeps it by drawing inside the Dialog.
 */
const file = '../src/editor.ts'
const tests = ['packages/mixins-crud/test/editor.test.ts']

export default [
  {
    name: 'a save in flight hides the form',
    edits: [
      {
        file,
        find: "Saving: { line: 'busy', words: 'saving', form: true },",
        replace: "Saving: { line: 'busy', words: 'saving', form: false },",
      },
    ],
    tests,
  },
  {
    name: 'a failed save closes the form',
    edits: [
      {
        file,
        find: "SaveFailed: { line: 'alert', words: 'saveFailed', form: true },",
        replace: "SaveFailed: { line: 'alert', words: 'saveFailed', form: false },",
      },
    ],
    tests,
  },
  {
    name: 'a failed read is said, not raised as an alert',
    edits: [
      {
        file,
        find: "LoadFailed: { line: 'alert', words: 'loadFailed', form: false },",
        replace: "LoadFailed: { line: 'said', words: 'loadFailed', form: false },",
      },
    ],
    tests,
  },
  {
    name: 'a closed editor is drawn',
    edits: [{ file, find: "if (input.status === 'Closed') return h.empty", replace: '' }],
    tests,
  },
  {
    name: 'a retry is offered whatever the state',
    edits: [
      {
        file,
        find: "input.status === 'LoadFailed' && input.onRetry !== undefined",
        replace: 'input.onRetry !== undefined',
      },
    ],
    tests,
  },
  {
    name: 'a delete confirms with nothing named',
    edits: [
      {
        file,
        find: 'Option.isNone(input.name)',
        replace: 'false',
      },
    ],
    tests,
  },
]
