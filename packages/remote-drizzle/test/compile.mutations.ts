/**
 * The Drizzle query source's handling of what a request asks, broken in turn:
 * `pnpm mutate packages/remote-drizzle/test/compile.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = ['packages/remote-drizzle/test/compile.test.ts']
const file = '../src/index.ts'
export default [
  {
    name: 'a search the SQL cannot hold fails the request as a defect',
    edits: [
      {
        file,
        find: '                  if (error instanceof QueryCompileError)\n                    return Effect.fail(new RemoteServerError({ message: error.message }))\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'Postgres folds text by its collation',
    edits: [
      {
        file: '../src/compile.ts',
        find: 'return is(target.table, PgTable)',
        replace: 'return false',
      },
    ],
    tests: ['packages/remote-drizzle/test/conformance.test.ts'],
  },
]
