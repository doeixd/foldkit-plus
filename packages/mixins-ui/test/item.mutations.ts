/**
 * The item, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/item.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = ['packages/mixins-ui/test/item.test.ts']

export default [
  {
    name: 'titles read regular weight',
    edits: [
      {
        file: '../src/recipes/item.ts',
        find: 'fontWeight: ref.weight.semibold,',
        replace: 'fontWeight: ref.weight.normal,',
      },
    ],
    tests,
  },
  {
    name: 'every row is compact',
    edits: [
      {
        file: '../src/recipes/item.ts',
        find: "defaults: { density: 'comfortable' },",
        replace: "defaults: { density: 'compact' },",
      },
    ],
    tests,
  },
]
