/**
 * #460: boot Commands planned from the Model the runtime starts with, broken
 * in turn: `pnpm mutate packages/ssr/test/boot.mutations.ts` checks that a
 * test fails for it.
 */
const client = '../src/client.ts'
const tests = ['packages/ssr/test/boot.test.ts']

export default [
  {
    name: 'boot Commands are planned from the resumed Model, before the arrival',
    edits: [
      {
        file: client,
        find: 'commands: [...bootCommands(step.model), ...(step.commands ?? [])],',
        replace: 'commands: [...bootCommands(model), ...(step.commands ?? [])],',
      },
    ],
    tests,
  },
]
