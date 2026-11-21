/**
 * A placement's contract: `pnpm mutate packages/bundle-surface/test/module.mutations.ts`.
 */
export default [
  {
    name: 'a placement says it reads nothing',
    edits: [
      {
        file: '../src/index.ts',
        find: 'observes: [placement.link.path],',
        replace: 'observes: [],',
      },
    ],
    tests: ['packages/bundle-surface/test/module.test.ts'],
  },
]
