/**
 * The checkbox-group example, broken in turn:
 * `pnpm mutate examples/widgets/test/checkbox-group.mutations.ts` checks that
 * a test fails for every one.
 */
const tests = ['examples/widgets/test/checkbox-group.test.ts']

export default [
  {
    name: 'picks replace instead of accumulating',
    edits: [
      {
        file: '../src/checkbox-group/app.ts',
        find: "export const selArgs = { mode: 'multiple', allowEmpty: true } as const",
        replace: "export const selArgs = { mode: 'single', allowEmpty: true } as const",
      },
    ],
    tests,
  },
  {
    name: 'boxes never check',
    edits: [
      {
        file: '../src/checkbox-group/view.ts',
        find: 'h.Checked(selected.has(topping)),',
        replace: 'h.Checked(false),',
      },
    ],
    tests,
  },
]
