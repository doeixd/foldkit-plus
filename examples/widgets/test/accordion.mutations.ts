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
        find: 'Option.isSome(open) && open.value === id ? Option.none() : Option.some(id)',
        replace: 'Option.some(id)',
      },
    ],
    tests,
  },
  {
    name: 'a shut panel stays visible',
    edits: [
      {
        file: '../src/accordion/view.ts',
        find: 'h.Hidden(!open)',
        replace: 'h.Hidden(false)',
      },
    ],
    tests,
  },
]
