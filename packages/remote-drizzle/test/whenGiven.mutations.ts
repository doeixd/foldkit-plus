/**
 * A null membership list is unknown, in the compiler and in `evaluate`:
 * `pnpm mutate packages/remote-drizzle/test/whenGiven.mutations.ts` checks that a
 * test fails for every one.
 */
const compiler = '../src/compile.ts'
const evaluate = '../../entity/src/evaluate.ts'
const tests = [
  'packages/remote-drizzle/test/whenGiven.test.ts',
  'packages/remote-drizzle/test/conformance.test.ts',
  'packages/remote-server/test/conformance.test.ts',
]

export default [
  {
    name: 'the compiler refuses a null membership list again',
    edits: [
      {
        file: compiler,
        find: 'if (among === null || among === undefined) return sql`null`',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'evaluate refuses a null membership list again',
    edits: [{ file: evaluate, find: "if (isNull(among)) return 'unknown'", replace: '' }],
    tests,
  },
]
