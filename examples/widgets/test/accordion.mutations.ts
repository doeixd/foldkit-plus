/**
 * The accordion example, broken in turn:
 * `pnpm mutate examples/widgets/test/accordion.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = ['examples/widgets/test/accordion.test.ts']

export default [
  {
    name: 'toggling never closes',
    edits: [
      {
        file: '../src/accordion/app.ts',
        find: 'return { model: { ...model, open: model.open === message.id ? null : message.id } }',
        replace: 'return { model: { ...model, open: message.id } }',
      },
    ],
    tests,
  },
  {
    name: 'every body draws',
    edits: [
      {
        file: '../src/accordion/view.ts',
        find: '...(open',
        replace: '...(true || open',
      },
    ],
    tests,
  },
]
