const checks = '../src/operationChecks.ts'
const tests = ['packages/metakit/test/operationChecks.test.ts']

const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
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
