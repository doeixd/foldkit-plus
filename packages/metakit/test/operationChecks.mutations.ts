const checks = '../src/operationChecks.ts'
const tests = ['packages/metakit/test/operationChecks.test.ts']

const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'checkOperation treats pairwise refusals as law evidence',
    checks,
    '!Node.isRefusal(left) &&\n    !Node.isRefusal(right)',
    'true',
  ),
  edit(
    'checkOperation treats strict null propagation as law evidence',
    checks,
    "(desc.nulls === 'own' || !args.includes(null)) &&",
    '',
  ),
  edit(
    'checkOperation skips identity',
    checks,
    'if (claims.identity !== undefined) {',
    'if (false) {',
  ),
  edit(
    'checkOperation skips absorbing values',
    checks,
    'if (claims.absorbing !== undefined) {',
    'if (false) {',
  ),
  edit(
    'checkOperation compares one grouping with itself for associativity',
    checks,
    'const rhs = run(desc, [a, bc])',
    'const rhs = lhs',
  ),
  edit(
    'checkOperation ignores the monotone direction',
    checks,
    "const ok = dir === 'up' ? rLo <= rHi : rLo >= rHi",
    'const ok = true',
  ),
  edit(
    'checkOperation skips idempotent check',
    checks,
    'if (claims.idempotent === true) {',
    'if (false && claims.idempotent === true) {',
  ),
  edit(
    'checkOperation skips commutative check',
    checks,
    'if (claims.commutative === true) {',
    'if (false && claims.commutative === true) {',
  ),
  edit(
    'checkOperation skips invertible check',
    checks,
    'if (claims.invertible !== undefined) {',
    'if (false && claims.invertible !== undefined) {',
  ),
  edit(
    'checkOperation skips SQL parity mismatch detection',
    checks,
    'if (!sameAnswer(sqlAnswers[i], recordedAnswers[i])) {',
    'if (false && !sameAnswer(sqlAnswers[i], recordedAnswers[i])) {',
  ),
]
