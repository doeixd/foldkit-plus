/**
 * The drawn editor's busy state, broken: `pnpm mutate packages/mixins-crud/test/editorBusy.mutations.ts`.
 */
const tests = ['packages/mixins-crud/test/editorBusy.browser.test.ts']

export default [
  {
    name: 'the drawn form never reads its save',
    edits: [
      {
        file: '../../crud/src/index.ts',
        find: 'submitting: busy(root) || (given as SubmitInputs | undefined)?.submitting === true,',
        replace: 'submitting: (given as SubmitInputs | undefined)?.submitting === true,',
      },
    ],
    tests,
  },
  {
    name: 'a placement draws with the inputs given, never its own',
    edits: [
      {
        file: '../../bundle/src/placed.ts',
        find: 'config.viewInputs === undefined ? given : config.viewInputs(parent, given)',
        replace: 'given',
      },
    ],
    tests,
  },
  {
    name: 'the form is never drawn busy',
    edits: [
      {
        file: '../../mixins-form/src/index.ts',
        find: "...(submitting ? [h.AriaBusy(true), h.DataAttribute('submitting', '')] : []),",
        replace: '',
      },
    ],
    tests,
  },
]
