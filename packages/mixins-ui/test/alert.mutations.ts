/**
 * The alert, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/alert.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = ['packages/mixins-ui/test/alert.test.ts']

export default [
  {
    name: 'every alert interrupts',
    edits: [
      {
        file: '../src/alert.ts',
        find: "h.Role(options.assertive === true ? 'alert' : 'status')",
        replace: "h.Role('alert')",
      },
    ],
    tests,
  },
  {
    name: 'errors read as info',
    edits: [
      {
        file: '../src/recipes/alert.ts',
        find: "error: { root: toned('error') },",
        replace: "error: { root: toned('info') },",
      },
    ],
    tests,
  },
]
