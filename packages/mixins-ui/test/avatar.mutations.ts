/**
 * The avatar, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/avatar.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = ['packages/mixins-ui/test/avatar.test.ts']

export default [
  {
    name: 'initials take every name part',
    edits: [
      {
        file: '../src/avatar.ts',
        find: '.slice(0, 2)',
        replace: '.slice(0, 3)',
      },
    ],
    tests,
  },
  {
    name: 'pictures tile instead of covering',
    edits: [
      {
        file: '../src/recipes/avatar.ts',
        find: "objectFit: 'cover',",
        replace: "objectFit: 'fill',",
      },
    ],
    tests,
  },
]
