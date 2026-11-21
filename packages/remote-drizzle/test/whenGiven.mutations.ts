/**
 * A null membership list is unknown, in the compiler and in `evaluate`:
 * `pnpm mutate packages/remote-drizzle/test/whenGiven.mutations.ts` checks that a
 * test fails for every one.
 */
const compiler = '../src/lowering.ts'
const evaluate = '../../entity/src/evaluate.ts'
const tests = [
  'packages/remote-drizzle/test/whenGiven.test.ts',
  'packages/remote-drizzle/test/lowering.test.ts',
  'packages/remote-drizzle/test/conformance.test.ts',
  'packages/remote-server/test/conformance.test.ts',
]

export default [
  {
    name: 'the compiler refuses a null membership list again',
    edits: [
      {
        file: compiler,
        find: "(node.op.id === 'eq.among' && isNull(node.args[1]))",
        replace: 'false',
      },
    ],
    tests,
  },
]
