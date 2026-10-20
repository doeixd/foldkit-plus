/**
 * The grid's style, broken in turn:
 * `pnpm mutate packages/mixins-data-grid/test/style.mutations.ts` checks that a
 * test fails for every one.
 */
export default [
  {
    name: 'a column that does not edit is marked with another icon',
    edits: [{ file: '../src/style.ts', find: '${ref.icon.lock}', replace: '${ref.icon.info}' }],
    tests: ['packages/mixins-data-grid/test/style.test.ts'],
  },
]
