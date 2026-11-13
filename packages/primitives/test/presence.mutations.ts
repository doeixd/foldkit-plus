/**
 * Presence under reduced motion, broken in turn: `pnpm mutate
 * packages/primitives/test/presence.mutations.ts`.
 */
const file = '../src/motion/presence.ts'
const tests = ['packages/primitives/test/presence.test.ts']

export default [
  {
    name: 'reduced motion still waits out the duration',
    edits: [
      {
        file,
        find: '                  reduced\n',
        replace: '                  false\n',
      },
    ],
    tests,
  },
]
