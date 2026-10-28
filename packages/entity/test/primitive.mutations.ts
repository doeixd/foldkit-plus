/**
 * Primitive operators and their tables, each step broken in turn:
 * `pnpm mutate packages/entity/test/primitive.mutations.ts` checks that a test
 * fails for every one.
 */
const expr = '../src/expr.ts'
const evaluate = '../src/evaluate.ts'
const operators = '../src/operators.ts'
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
    'a strict operator is asked about a null',
    evaluate,
    "if (operator.nulls === 'strict' && values.some(isNull)) return null",
    '',
  ),
  edit(
    'text holding NUL reaches an implementation',
    evaluate,
    'if (values.some(holdsNul)) {',
    'if (false) {',
  ),
  edit(
    'a throw from an implementation goes out unnamed',
    evaluate,
    'if (error instanceof QueryEvaluateError) throw error',
    'throw error',
  ),
  edit(
    'a checked table checks nothing',
    evaluate,
    'if (checked && !unknownTruth',
    'if (false && !unknownTruth',
  ),
  edit(
    'a predicate may answer something that is not a truth',
    evaluate,
    "if (typeof answer !== 'boolean') {",
    'if (false) {',
  ),
  edit(
    'a predicate answering null is not unknown',
    evaluate,
    "if (answer === null || answer === undefined) return 'unknown'",
    '',
  ),
  edit(
    'a table is never asked',
    evaluate,
    'Option.match(scope.operators.get(call.operator), {',
    'Option.match(Option.none<never>(), {',
  ),
  edit(
    'evaluate ignores the table it is given',
    evaluate,
    `const operators = options.operators ?? Operators.kernel
  const { context } = options
  assertSupported(body, operators)
  return ordered(`,
    `const operators = Operators.kernel
  const { context } = options
  assertSupported(body, operators)
  return ordered(`,
  ),
  edit(
    'deciding over the input ignores the table',
    evaluate,
    'holds(node, { row: noRow, input, next: noRow, operators, judging: false, context }),',
    'holds(node, { row: noRow, input, next: noRow, operators: Operators.kernel, judging: false, context }),',
  ),
  edit(
    'a row is judged with the kernel whatever the table',
    evaluate,
    '  settled(holds(node, { row: flat(row), input, next: flat(next), operators, judging: false }))',
    '  settled(holds(node, { row: flat(row), input, next: flat(next), operators: Operators.kernel, judging: false }))',
  ),

  // ---- tables
  edit(
    'one operator may be implemented twice',
    operators,
    'if (byOperator.has(operator)) {',
    'if (false) {',
  ),
  edit(
    'two operators may share a name',
    operators,
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
    operators,
    'if (operator.nulls !== nulls) {',
    'if (false) {',
  ),
  edit(
    'startsWith never folds',
    operators,
    "const folded = Option.exists(collation, each => each._tag === 'AsciiFold')",
    'const folded = false',
  ),

  // ---- declaring and calling
  edit(
    'a defined operator may declare a null rule',
    expr,
    '(options.nulls !== undefined || options.collation !== undefined)',
    'false',
  ),
  edit(
    'a result that is not text may carry a collation',
    expr,
    "if (collation === 'operands' && orderKindOf(",
    'if (false && orderKindOf(',
  ),
  edit(
    'text with no collation may be compared by a call needing one',
    expr,
    'if (shared === undefined) {',
    'if (false) {',
  ),
  edit(
    'operands declaring different collations are taken',
    expr,
    'if (collations.some(each => each._tag !== shared._tag)) {',
    'if (false) {',
  ),
  edit(
    'a declared locale is taken where a collation is required',
    expr,
    "if (shared._tag === 'Locale') {",
    'if (false) {',
  ),
  edit(
    'a collation is taken by an operator comparing no text',
    expr,
    "if (Option.isSome(descriptor.definedAs) || descriptor.collation === 'none') {",
    'if (false) {',
  ),
  edit(
    'a given locale is taken where a collation is required',
    expr,
    "if (collation._tag === 'Locale') {",
    'if (false) {',
  ),
  edit(
    'a comparison reads no collation from a call',
    expr,
    'Call: call => [{ name: showExpr(call), collation: call.collation }],',
    'Call: () => [],',
  ),
  edit(
    'a table implementing an operator still leaves it unsupported',
    expr,
    '.filter(operator => Option.isNone(operator.definedAs) && !operators.has(operator))',
    '.filter(operator => Option.isNone(operator.definedAs))',
  ),
  edit(
    'a defined operator is unsupported',
    expr,
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
]
