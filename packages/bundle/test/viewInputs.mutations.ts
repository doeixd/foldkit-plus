/**
 * A placement's `viewInputs`, broken: `pnpm mutate packages/bundle/test/viewInputs.mutations.ts`.
 */
export default [
  {
    name: 'the placement draws with the inputs given, never its own',
    edits: [
      {
        file: '../src/placed.ts',
        find: 'config.viewInputs === undefined ? given : config.viewInputs(parent, given)',
        replace: 'given',
      },
    ],
    tests: ['packages/bundle/test/viewInputs.test.ts'],
  },
]
