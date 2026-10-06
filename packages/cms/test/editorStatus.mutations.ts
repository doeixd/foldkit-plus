/**
 * An entry opened whole, broken in turn:
 * `pnpm mutate packages/cms/test/editorStatus.mutations.ts` checks that a test fails for every one.
 */
const file = '../src/editor.ts'
const tests = ['packages/cms/test/editor.test.ts']

export default [
  {
    name: 'an entry is open before its state is read',
    edits: [
      { file, find: 'if (!editor.filled || stateUnread) {', replace: 'if (!editor.filled) {' },
    ],
    tests,
  },
  {
    name: 'something new waits for a state the server does not hold',
    edits: [{ file, find: "              editor.mode === 'edit' &&\n", replace: '' }],
    tests,
  },
]
