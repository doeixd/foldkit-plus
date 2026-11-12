/**
 * Whether a submit waits for a running check, broken in turn:
 * `pnpm mutate packages/form/test/submitWaits.mutations.ts`.
 */
const file = '../src/index.ts'
const tests = [
  'packages/form/test/checks.test.ts',
  'packages/mixins-form/test/strictSubmit.browser.test.ts',
]

export default [
  {
    name: 'a form that does not wait still holds the submit for the check',
    edits: [
      {
        file,
        find: 'return { model: submitWaits ? { ...next, submitPending: true } : next, commands }',
        replace: 'return { model: { ...next, submitPending: true }, commands }',
      },
    ],
    tests,
  },
  {
    name: 'a form waits only when asked to',
    edits: [
      {
        file,
        find: 'const submitWaits = options.submitWaits ?? true',
        replace: 'const submitWaits = options.submitWaits ?? false',
      },
    ],
    tests,
  },
]
