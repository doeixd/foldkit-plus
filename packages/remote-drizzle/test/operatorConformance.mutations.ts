/**
 * One call compiled alone for the conformance helper, broken in turn:
 * `pnpm mutate packages/remote-drizzle/test/operatorConformance.mutations.ts`.
 */
const tests = ['packages/remote-drizzle/test/operatorConformance.test.ts']
const compile = '../src/compile.ts'
const kernel = '../../entity/src/memoryTable.ts'

export default [
  {
    name: 'a predicate call is refused',
    edits: [
      {
        file: compile,
        find: "call._tag !== 'Test' && call._tag !== 'Call'",
        replace: "call._tag !== 'Call'",
      },
    ],
    tests,
  },
  {
    name: 'a scalar call is refused',
    edits: [
      {
        file: compile,
        find: "call._tag !== 'Test' && call._tag !== 'Call'",
        replace: "call._tag !== 'Test'",
      },
    ],
    tests,
  },
  {
    name: 'anything compiles alone',
    edits: [
      {
        file: compile,
        find: '  throw new QueryCompileError(`${query}: only a call of an operator compiles alone`)',
        replace: '  return sql`null`',
      },
    ],
    tests,
  },
]
