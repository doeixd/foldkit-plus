const edit = (name: string, module: string, find: string, replace: string, test: string) => ({
  name,
  edits: [{ file: '../src/' + module + '.ts', find, replace }],
  tests: ['packages/metakit/test/' + test + '.test.ts'],
})

const operation = (name: string, find: string, replace: string) =>
  edit(name, 'operationChecks', find, replace, 'operationChecks')

const residual = (name: string, find: string, replace: string) =>
  edit(name, 'conformance', find, replace, 'conformance')

export default [
  residual(
    'residualize soundness checks only the first environment',
    'for (const env of envs) {',
    'for (const env of envs.slice(0, 1)) {',
  ),
  residual(
    'residualize soundness ignores a different concrete answer',
    'if (!sameOutcome(full, residual)) {',
    'if (false && !sameOutcome(full, residual)) {',
  ),
  operation(
    'commutativity checks boundary pairs but skips seeded pairs',
    'if (!checkPair(pick(pool), pick(pool))) break',
    'break',
  ),
  operation(
    'a matching equation without a value witness discharges the claim',
    '(witnessed\n        ? undefined',
    '(true\n        ? undefined',
  ),
  operation(
    'right identity checks the left identity equation',
    'const res = run(desc, [x, idVal])',
    'const res = run(desc, [idVal, x])',
  ),
  operation(
    'commutativity compares the original argument order twice',
    'const ba = run(desc, [b, a])',
    'const ba = run(desc, [a, b])',
  ),
  operation(
    'associativity swaps the operands of the right grouping',
    'const rhs = run(desc, [a, bc])',
    'const rhs = run(desc, [bc, a])',
  ),
  operation(
    'conditional associativity counts a skipped refusal as evidence',
    'if (unlessRefused && (Node.isRefusal(lhs) || Node.isRefusal(rhs))) return true',
    'if (unlessRefused && (Node.isRefusal(lhs) || Node.isRefusal(rhs))) {\n        witnessed = true\n        return true\n      }',
  ),
  operation(
    'conditional associativity demands agreement even when a grouping refuses',
    'if (unlessRefused && (Node.isRefusal(lhs) || Node.isRefusal(rhs))) return true',
    '',
  ),
  operation(
    'strict null propagation witnesses an equation when both sides return null',
    "(desc.nulls === 'own' || !args.includes(null)) &&",
    "(desc.nulls === 'own' || (left === null && right === null) || !args.includes(null)) &&",
  ),
  operation(
    'SQL parity passes when no valid calls were available',
    'if (recordedCalls.length === 0) {',
    'if (false && recordedCalls.length === 0) {',
  ),
]
