/**
 * The toggle example, broken in turn:
 * `pnpm mutate examples/widgets/test/toggle.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = ['examples/widgets/test/toggle.test.ts']

export default [
  {
    name: 'toggling sticks on',
    edits: [
      {
        file: '../src/toggle/app.ts',
        find: 'return { model: { ...model, on: !model.on } }',
        replace: 'return { model: { ...model, on: true } }',
      },
    ],
    tests,
  },
  {
    name: 'pressed state reports checked instead',
    edits: [
      {
        file: '../src/toggle/view.ts',
        replace: "as: 'checked',",
        find: "as: 'pressed',",
      },
    ],
    tests,
  },
]
