/**
 * Primitive operators and their tables, each step broken in turn:
 * `pnpm mutate packages/entity/test/primitive.mutations.ts` checks that a test
 * fails for every one.
 */
const operator = '../src/expr/operator.ts'
const operand = '../src/expr/operand.ts'
const dependencies = '../src/expr/dependencies.ts'
const evaluate = '../src/evaluate.ts'
const operators = '../src/operators.ts'
const memoryTable = '../src/memoryTable.ts'
const reading = '../src/reading.ts'
const invariant = '../src/invariant.ts'
const tests = [
  'packages/entity/test/primitive.test.ts',
  'packages/entity/test/operator.test.ts',
  'packages/remote-server/test/conformance.test.ts',
]
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  // ---- running a call
  edit(
    'text holding NUL reaches an implementation',
    reading,
    "if (values.some(value => typeof value === 'string' && value.includes(NUL))) {",
    'if (false) {',
  ),
  edit('a checked table checks nothing', reading, 'return operators.checked &&', 'return false &&'),
  edit(
    'a table is never asked',
    '../src/judgeRun.ts',
    'const foreign: ForeignImplementations = foreignOf(reading, over.operators)',
    'const foreign: ForeignImplementations = {}',
  ),
  edit(
    'evaluate ignores the table it is given',
    evaluate,
    `const operators = options.operators ?? kernelOperators
  const { context } = options
  assertSupported(body, operators)
  return ordered(`,
    `const operators = kernelOperators
  const { context } = options
  assertSupported(body, operators)
  return ordered(`,
  ),
  edit(
    'deciding over the input ignores the table',
    evaluate,
    '{ row: noRow, next: noRow, input, operators, context }',
    '{ row: noRow, next: noRow, input, operators: kernelOperators, context }',
  ),
  edit(
    'a row is judged with the kernel whatever the table',
    evaluate,
    '{ row: flatRow(row), next: flatRow(next), input, operators }',
    '{ row: flatRow(row), next: flatRow(next), input, operators: kernelOperators }',
  ),

  // ---- tables
  edit(
    'one operator may be implemented twice',
    memoryTable,
    'if (byOperator.has(operator)) {',
    'if (false) {',
  ),
  edit(
    'two operators may share a name',
    memoryTable,
    'if (named !== undefined && named !== operator) {',
    'if (false) {',
  ),
  edit('a merge may overlap', operators, 'if (both.length > 0) {', 'if (false) {'),
  edit(
    'an override keeps what it replaces',
    operators,
    '...base.implementations.filter(({ operator }) => !replaced.has(operator)),',
    '...base.implementations,',
  ),
  edit(
    'an implementation may break its null rule',
    memoryTable,
    'if (operator.nulls !== nulls) {',
    'if (false) {',
  ),
  edit(
    'startsWith never folds',
    '../src/text.ts',
    '(args, fold) => Node.Call({ op: Str.startsWithOp, args: args.map(fold) }),',
    '(args) => Node.Call({ op: Str.startsWithOp, args }),',
  ),

  // ---- declaring and calling
  edit(
    'a defined operator may declare a null rule',
    operator,
    '(options.nulls !== undefined || options.collation !== undefined)',
    'false',
  ),
  edit(
    'a result that is not text may carry a collation',
    operator,
    "if (collation === 'operands' && storedKindOf(options.output) !== 'text') {",
    'if (false) {',
  ),
  edit(
    'text with no collation may be compared by a call needing one',
    operator,
    'if (shared === undefined) {',
    'if (false) {',
  ),
  edit(
    'operands declaring different collations are taken',
    operator,
    'if (collations.some(each => each._tag !== shared._tag)) {',
    'if (false) {',
  ),
  edit(
    'a declared locale is taken where a collation is required',
    operator,
    "if (shared._tag === 'Locale') {",
    'if (false) {',
  ),
  edit(
    'a collation is taken by an operator comparing no text',
    operator,
    "if (Option.isSome(descriptor.definedAs) || descriptor.collation === 'none') {",
    'if (false) {',
  ),
  edit(
    'a given locale is taken where a collation is required',
    operator,
    "if (collation._tag === 'Locale') {",
    'if (false) {',
  ),
  edit(
    'a comparison reads no collation from a call',
    operand,
    'Call: call => call.collation,',
    'Call: () => Option.none<Collation>(),',
  ),
  edit(
    'a table implementing an operator still leaves it unsupported',
    dependencies,
    '.filter(operator => Option.isNone(operator.definedAs) && !operators.has(operator))',
    '.filter(operator => Option.isNone(operator.definedAs))',
  ),
  edit(
    'a defined operator is unsupported',
    dependencies,
    '.filter(operator => Option.isNone(operator.definedAs) && !operators.has(operator))',
    '.filter(operator => !operators.has(operator))',
  ),

  // ---- invariants
  edit(
    'an operator the table lacks fails the judge',
    invariant,
    'if (!(error instanceof OperatorMissingError)) throw error',
    'throw error',
  ),
  edit(
    'every refusal is read as undecided',
    invariant,
    'if (!(error instanceof OperatorMissingError)) throw error',
    '',
  ),
  edit(
    'an input is judged with the kernel whatever the table',
    invariant,
    'return judgeAgainst(invariants, { after: row }, operators)',
    'return judgeAgainst(invariants, { after: row })',
  ),
  edit(
    'a Schema check judges with the kernel whatever the table',
    invariant,
    'const judged = judge(entity, { after: row }, options.operators)',
    'const judged = judge(entity, { after: row })',
  ),
  edit(
    'a check is made over an operator its table lacks',
    invariant,
    'if (missing.length > 0) {',
    'if (false) {',
  ),
  edit(
    'a check counts what the judge runs as missing',
    invariant,
    '    dependenciesOf(...predicates).operations,',
    '    [],',
  ),
]
