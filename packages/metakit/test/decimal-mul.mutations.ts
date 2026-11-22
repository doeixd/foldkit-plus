/**
 * Mutations proving `num.mulScaled`'s tests catch each reader going wrong:
 *   `pnpm mutate packages/metakit/test/decimal-mul.mutations.ts`
 * The SQL ones run the parity suite, which needs PGlite and SQLite.
 */
const op = '../src/ops/mulScaled.ts'
const sqlText = '../src/sqlMulScaled.ts'
const lowering = '../src/sqlLowering.ts'
const checker = '../src/abstract/mulScaled.ts'
const stateOf = '../src/abstract/state.ts'
const solver = '../src/prove/mulScaled.ts'
const solverRow = '../src/prove/lower.ts'
const aggregates = '../src/aggregates.ts'

const unit = ['packages/metakit/test/decimal-mul.test.ts']
const parity = ['packages/metakit/test/decimal-mul-parity.test.ts']

const mutation = (
  name: string,
  file: string,
  find: string,
  replace: string,
  tests: ReadonlyArray<string>,
) => ({ name, edits: [{ file, find, replace }], tests })

export default [
  // Evaluation
  mutation(
    'a tie rounds away from zero',
    op,
    'return q % 2n === 0n ? q : q + step',
    'return q + step',
    unit,
  ),
  mutation(
    'a product outside the safe range is kept',
    op,
    'if (product > MAX_SAFE || product < -MAX_SAFE) {',
    'if (false) {',
    unit,
  ),
  mutation(
    'a result moved up past the safe range is kept',
    op,
    'if (result > MAX_SAFE || result < -MAX_SAFE) {',
    'if (false) {',
    unit,
  ),
  mutation(
    'a fraction is taken for a count of units',
    op,
    'if (!Number.isInteger(operand)) {',
    'if (false) {',
    unit,
  ),
  mutation(
    'an operand past the safe range is taken beside a zero',
    op,
    'if (!Number.isSafeInteger(operand)) return refused(',
    'if (false) return refused(',
    unit,
  ),
  mutation(
    'a shift that is no number of places is taken',
    op,
    'if (!isShift(shift)) {\n    return Node.illTyped',
    'if (false) {\n    return Node.illTyped',
    unit,
  ),
  mutation(
    'a built shift is not checked',
    op,
    'if (!isShift(options.shift)) {',
    'if (false) {',
    unit,
  ),
  // SQL
  mutation(
    'SQL rounds a tie up',
    sqlText,
    "' % 2) + 2) % 2) = 0 THEN 0 ELSE 1 END))'",
    "' % 2) + 2) % 2) = 0 THEN 1 ELSE 1 END))'",
    parity,
  ),
  mutation(
    'SQL takes a truncating remainder for a floor one',
    sqlText,
    '% ${d}) + ${d}) % ${d})`',
    '% ${d}) + 0) % ${d})`',
    parity,
  ),
  mutation(
    'SQL lets a product ten times the safe range through',
    sqlText,
    '` NOT BETWEEN -${SAFE} AND ${SAFE}`',
    '` NOT BETWEEN -${SAFE}0 AND ${SAFE}0`',
    parity,
  ),
  mutation(
    'SQL does not refuse an operand past the safe range beside a zero',
    sqlText,
    "    ' OR ',\n    ...outside([LEFT]),\n",
    '',
    parity,
  ),
  mutation(
    'Postgres multiplies as bigint, which overflows',
    sqlText,
    "['(CAST(', LEFT, ' AS numeric) * ', RIGHT, ')']",
    "['(', LEFT, ' * ', RIGHT, ')']",
    parity,
  ),
  mutation(
    'SQL tests only the product when it moves up',
    sqlText,
    "return guarded(['(', ...wide, up, ')'], ['(', ...exact, up, ')'])",
    "return guarded(wide, ['(', ...exact, up, ')'])",
    parity,
  ),
  mutation(
    'SQL writes a zero for a null operand past the last divisor',
    sqlText,
    "guarded(wide, ['(', ...exact, ' * 0)'])",
    "guarded(wide, ['0'])",
    parity,
  ),
  mutation(
    'SQL writes a divisor past int64',
    sqlText,
    'const MAX_DIVISOR_SHIFT = 16',
    'const MAX_DIVISOR_SHIFT = 24',
    parity,
  ),
  mutation(
    'SQL lowers a column that may hold a fraction',
    lowering,
    'if (![args[0]!, args[1]!].every(arg => isIntegerTerm(arg) || isIntegerLiteral(arg))) {',
    'if (false) {',
    unit,
  ),
  mutation(
    'SQL does not read a product as an integer term',
    lowering,
    "  'num.neg',\n  'num.mulScaled',\n  'null.coalesce',",
    "  'num.neg',\n  'null.coalesce',",
    unit,
  ),
  // The checker
  mutation(
    'the checker bounds a rounded end by truncation',
    checker,
    'roundHalfEvenBig(ends[0]!, down)',
    'ends[0]! / down',
    unit,
  ),
  mutation(
    'the checker bounds the upper end by truncation',
    checker,
    'roundHalfEvenBig(ends[1]!, down)',
    'ends[1]! / down',
    unit,
  ),
  mutation(
    'the checker keeps a product moved up to the product alone',
    checker,
    'return shift >= 0 ||',
    'return true ||',
    unit,
  ),
  mutation(
    'the checker takes a fraction for an integer',
    checker,
    '!integers[0] || !integers[1]',
    'false',
    unit,
  ),
  mutation(
    'the checker takes the result and not the product for the range',
    stateOf,
    '(unrefused === undefined\n          ?',
    '(true\n          ?',
    unit,
  ),
  // The solver
  mutation(
    'the solver rounds a tie to the odd neighbour',
    solver,
    'z3.If(even, q, next)',
    'z3.If(even, next, q)',
    unit,
  ),
  mutation(
    'the solver does not refuse a product past the safe range',
    solverRow,
    'halfEven(z3, product, shift), unsafe(product))',
    'halfEven(z3, product, shift), never)',
    unit,
  ),
  mutation(
    'the solver reads a fraction as an integer',
    solverRow,
    'if (!z3.isInt(left) || !z3.isInt(right)) {',
    'if (false) {',
    unit,
  ),
  // Aggregates
  mutation(
    'Rows.sum refuses a decimal product',
    aggregates,
    "  'num.neg',\n  'num.mulScaled',\n])",
    "  'num.neg',\n])",
    unit,
  ),
]
