const operation = '../src/operation.ts'
const operationSql = '../src/operationSql.ts'
const evalFile = '../src/ops/eval.ts'
const tests = ['packages/metakit/test/operation.test.ts']

const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'define accepts a core prefix',
    operation,
    'if (reserved !== undefined) {',
    'if (false && reserved !== undefined) {',
  ),
  edit(
    'define accepts version 0',
    operation,
    'if (!Number.isSafeInteger(spec.version) || spec.version < 1) {',
    'if (false && (!Number.isSafeInteger(spec.version) || spec.version < 1)) {',
  ),
  edit(
    'define accepts an encoded Schema',
    operation,
    'if (encoded !== undefined) {',
    'if (false && encoded !== undefined) {',
  ),
  edit(
    'define accepts an identity outside its Schema',
    operation,
    'if (!firstArgCheck.is(claims.identity.value)) {',
    'if (false && !firstArgCheck.is(claims.identity.value)) {',
  ),
  edit(
    'applyForeign skips argument Schema validation',
    evalFile,
    'if (op.checkArgs !== undefined) {',
    'if (false && op.checkArgs !== undefined) {',
  ),
  edit(
    'applyForeign skips result Schema validation',
    evalFile,
    'if (op.checkResult !== undefined && !op.checkResult.is(result)) {',
    'if (false && op.checkResult !== undefined && !op.checkResult.is(result)) {',
  ),
  edit(
    'implementations allows duplicate operation registrations',
    operation,
    'if (entries.has(item.key)) {',
    'if (false && entries.has(item.key)) {',
  ),
  edit(
    'lowerings allows duplicate operation registrations',
    operationSql,
    'if (entries.has(item.key)) {',
    'if (false && entries.has(item.key)) {',
  ),
]
