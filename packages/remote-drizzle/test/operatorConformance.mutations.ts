/**
 * One call compiled alone for the conformance helper, broken in turn:
 * `pnpm mutate packages/remote-drizzle/test/operatorConformance.mutations.ts`.
 */
const tests = ['packages/remote-drizzle/test/operatorConformance.test.ts']
const compile = '../src/compile.ts'

export default [
  {
    name: 'a predicate call is refused',
    edits: [
      {
        file: compile,
        find: "if (call._tag === 'Test') return callSql(call, target, {}, query)",
        replace: 'if (false) return callSql(call, target, {}, query)',
      },
    ],
    tests,
  },
  {
    name: 'a scalar call is refused',
    edits: [
      { file: compile, find: "} else if (call._tag === 'Call') {", replace: '} else if (false) {' },
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
