/**
 * The spinner, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/spinner.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = ['packages/mixins-ui/test/spinner.test.ts']

export default [
  {
    name: 'the wheel never turns',
    edits: [
      {
        file: '../src/recipes/spinner.ts',
        find: "to: { transform: 'rotate(360deg)' },",
        replace: "to: { transform: 'rotate(0deg)' },",
      },
    ],
    tests,
  },
  {
    name: 'small wheels come out large',
    edits: [
      {
        file: '../src/recipes/spinner.ts',
        find: "wheel: variant(Style.self({ inlineSize: '1rem', blockSize: '1rem' })),",
        replace: "wheel: variant(Style.self({ inlineSize: '1.5rem', blockSize: '1.5rem' })),",
      },
    ],
    tests,
  },
]
