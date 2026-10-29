/**
 * A form's controls by key, broken in turn:
 * `pnpm mutate packages/form/test/controls.mutations.ts`.
 */
const file = '../src/index.ts'
const tests = ['packages/form/test/form.test.ts']

export default [
  {
    name: 'a control is filed under its label, not its key',
    edits: [
      {
        file,
        find: 'Object.fromEntries(controls.map(entry => [entry.key, entry]))',
        replace: 'Object.fromEntries(controls.map(entry => [entry.label, entry]))',
      },
    ],
    tests,
  },
]
