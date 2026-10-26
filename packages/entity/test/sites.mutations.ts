/**
 * Every in-memory site that runs a primitive operator, each made to drop the
 * table it was given: `pnpm mutate packages/entity/test/sites.mutations.ts`
 * checks that a test fails for every one (expr-operations-DESIGN §5.5).
 */
const guard = '../../guard/src/index.ts'
const condition = '../../guard/src/condition.ts'
const guardServer = '../../guard/src/server.ts'
const server = '../../remote-server/src/index.ts'
const remote = '../../remote/src/index.ts'
const form = '../../form/src/index.ts'
const tests = [
  'packages/guard/test/server.test.ts',
  'packages/remote-server/test/memory.test.ts',
  'packages/remote/test/filtered.test.ts',
  'packages/remote/test/matching.test.ts',
  'packages/form/test/invariant.test.ts',
]
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'a policy ignores the table it is given',
    guard,
    'const operators = implementation.operators ?? Operators.kernel',
    'const operators = Operators.kernel',
  ),
  edit(
    'a guard asked alone runs with the kernel',
    guard,
    'evaluate(rowGuard.query, {}, [row], { operators }).length === 1,',
    'evaluate(rowGuard.query, {}, [row]).length === 1,',
  ),
  edit(
    'a condition runs with the kernel',
    condition,
    'Row: ({ guard }) => evaluate(guard.query, input, [values], { operators }).length === 1,',
    'Row: ({ guard }) => evaluate(guard.query, input, [values]).length === 1,',
  ),
  edit(
    'a server starts with a rule calling an operator its policy lacks',
    guardServer,
    '            ...operatorProblems,',
    '',
  ),
  edit(
    'startup checks a rule against no table',
    guardServer,
    'Query.unsupported(rule.query, supported, policy.operators)',
    'Query.unsupported(rule.query, supported)',
  ),
  edit(
    'a guarded read in memory runs with the kernel',
    guardServer,
    '                policy.operators,\n              )',
    '                Operators.kernel,\n              )',
  ),
  edit(
    'the in-memory server ignores its table',
    server,
    'const operators = config.operators ?? Operators.kernel',
    'const operators = Operators.kernel',
  ),
  edit(
    'the in-memory server starts with a body it cannot run',
    server,
    'if (query.body !== undefined) assertSupported(query.body, operators)',
    '',
  ),
  edit(
    'the in-memory server answers a query with the kernel',
    server,
    'const matched = evaluate(body, encoded, rows, { operators })',
    'const matched = evaluate(body, encoded, rows)',
  ),
  edit('Remote.make drops its table', remote, '      operators: config.operators,\n', ''),
  edit(
    'the client filters with the kernel',
    remote,
    'judged = matching(visible, by, input, { among, operators })',
    'judged = matching(visible, by, input, { among })',
  ),
  edit(
    'a form judges with the kernel',
    form,
    'Entity.judgeInput(input, value as Readonly<Record<string, unknown>>, options.operators),',
    'Entity.judgeInput(input, value as Readonly<Record<string, unknown>>),',
  ),
]
