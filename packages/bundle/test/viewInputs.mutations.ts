/**
 * A placement's `viewInputs`, broken: `pnpm mutate packages/bundle/test/viewInputs.mutations.ts`.
 */
const file = '../src/placed.ts'
const tests = ['packages/bundle/test/viewInputs.test.ts']

export default [
  {
    name: 'the placement draws with the inputs given, never its own',
    edits: [{ file, find: ': config.viewInputs(parent, given)', replace: ': given' }],
    tests,
  },
  {
    name: 'a view drawn without inputs is handed some',
    edits: [
      {
        file,
        find: 'config.viewInputs === undefined || given === undefined',
        replace: 'config.viewInputs === undefined',
      },
    ],
    tests,
  },
]
