/**
 * The worklist after a first save, broken in turn:
 * `pnpm mutate examples/cms/test/studioList.mutations.ts`.
 */
export default [
  {
    name: 'a mutation answer invalidates no list',
    edits: [
      {
        file: '../../../packages/remote/src/index.ts',
        find: "return changes.some(change => impactOn(held, visible, change)._tag === 'Invalidated')",
        replace: 'return false',
      },
    ],
    tests: ['examples/cms/test/studioList.test.ts'],
  },
]
