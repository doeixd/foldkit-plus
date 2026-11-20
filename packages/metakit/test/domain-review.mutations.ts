/**
 * Mutations proving the domain-type and aggregate tests catch each reviewed
 * defect coming back:
 *   `pnpm mutate packages/metakit/test/domain-review.mutations.ts`
 */
const calendarDay = '../src/domain/calendarDay.ts'
const fixed = '../src/domain/fixed.ts'
const decimal = '../src/domain/decimal.ts'
const money = '../src/domain/money.ts'
const aggregates = '../src/aggregates.ts'
const aggregatesSql = '../src/aggregatesSql.ts'

const domainTests = ['packages/metakit/test/domain-review.test.ts']
const aggregateTests = ['packages/metakit/test/aggregates-review.test.ts']

const mutation = (
  name: string,
  file: string,
  find: string,
  replace: string,
  tests: ReadonlyArray<string>,
) => ({ name, edits: [{ file, find, replace }], tests })

export default [
  // 1. CalendarDay over years 0001 to 9999
  mutation(
    'fromIso reads years 0 to 99 through Date.UTC',
    calendarDay,
    'check.setUTCFullYear(year, month - 1, day)',
    'check.setTime(Date.UTC(year, month - 1, day))',
    domainTests,
  ),
  mutation(
    'fromIso accepts year 0000',
    calendarDay,
    'if (year < 1) {',
    'if (false) {',
    domainTests,
  ),
  mutation(
    'toIso formats a day outside the range',
    calendarDay,
    '!Number.isInteger(day) || day < earliest || day > latest',
    '!Number.isInteger(day)',
    domainTests,
  ),
  mutation(
    'toIso formats a fractional day',
    calendarDay,
    '!Number.isInteger(day) || day < earliest',
    'day < earliest',
    domainTests,
  ),
  mutation(
    'toIso drops the zero padding of the year',
    calendarDay,
    "String(d.getUTCFullYear()).padStart(4, '0')",
    'String(d.getUTCFullYear())',
    domainTests,
  ),
  // 2. The scale a value is formatted at, and non-integers
  mutation(
    'Decimal.format falls back to scale 2',
    decimal,
    "Fixed.formatUnits(value, options.scale, 'Decimal.format')",
    "Fixed.formatUnits(value, 2, 'Decimal.format')",
    domainTests,
  ),
  mutation(
    'formatting accepts a value that is not a safe integer',
    fixed,
    '  assertUnits(units, who)\n',
    '',
    domainTests,
  ),
  // 3. Unsafe integers
  mutation(
    'units and minor accept an unsafe integer',
    fixed,
    'if (!Number.isSafeInteger(amount)) {',
    'if (!Number.isInteger(amount)) {',
    domainTests,
  ),
  mutation(
    'roundHalfEven accepts unsafe integers',
    fixed,
    'if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(divisor) || divisor <= 0) {',
    'if (!Number.isInteger(numerator) || !Number.isInteger(divisor) || divisor <= 0) {',
    domainTests,
  ),
  // 4. One formatter
  mutation(
    'Money.format divides in floating point',
    money,
    "`${Fixed.formatUnits(amount, options.scale, 'Money.format')} ${code}`",
    '`${(amount / 10 ** options.scale).toFixed(options.scale)} ${code}`',
    domainTests,
  ),
  // 5. One operation set
  mutation(
    'isNot is equality',
    fixed,
    'call(Eq.isNotOp, [left, right])',
    'call(Eq.isOp, [left, right])',
    domainTests,
  ),
  mutation('min is max', fixed, 'Num.min(left, right)', 'Num.max(left, right)', domainTests),
  // 6. Decimal.mul and Money.mul
  mutation(
    'a tie rounds away from zero instead of to even',
    fixed,
    'return q % 2n === 0n ? q : q + step',
    'return q + step',
    domainTests,
  ),
  mutation(
    'a product outside the safe range is kept',
    fixed,
    'if (product > MAX_SAFE || product < -MAX_SAFE) return Option.none()',
    '',
    domainTests,
  ),
  mutation(
    'a missing operand is multiplied',
    fixed,
    'if (!isSafeInteger(a) || !isSafeInteger(b)) return null',
    '',
    domainTests,
  ),
  mutation(
    "a stated scale is not checked against the field's Schema",
    fixed,
    'Option.isSome(declared) && declared.value !== stated.value',
    'Option.isSome(declared) && false',
    domainTests,
  ),
  mutation(
    'Decimal.mul ignores the right scale',
    decimal,
    'options.leftScale + options.rightScale - options.scale',
    'options.leftScale - options.scale',
    domainTests,
  ),
  mutation(
    'Money.mul does not move the point',
    money,
    '    options.rateScale,\n',
    '    0,\n',
    domainTests,
  ),
  // 7. Aggregates: integer sums, SQL's null and NaN answers
  mutation(
    'sum accepts any contribution',
    aggregates,
    'if (!isIntegerValued(contribution.node)) {',
    'if (false) {',
    aggregateTests,
  ),
  mutation(
    'every number is an integer',
    aggregates,
    'if (SchemaAST.isNumber(ast)) return (ast.checks ?? []).some(isIntCheck)',
    'if (SchemaAST.isNumber(ast)) return true',
    aggregateTests,
  ),
  mutation(
    'a nullable float reads as an integer',
    aggregates,
    'present.length > 0 && present.every(isIntegerAst)',
    'present.length > 0',
    aggregateTests,
  ),
  mutation(
    'every literal is an integer',
    aggregates,
    'Lit: ({ value }) => value === null || Number.isSafeInteger(value),',
    'Lit: () => true,',
    aggregateTests,
  ),
  mutation(
    "an operation's arguments are not read",
    aggregates,
    '(integerOps.has(op.id) && args.every(isIntegerValued))',
    'integerOps.has(op.id)',
    aggregateTests,
  ),
  mutation(
    'an opaque term is an integer',
    aggregates,
    'Opaque: () => false,',
    'Opaque: () => true,',
    aggregateTests,
  ),
  mutation(
    'a missing contribution is not zero',
    aggregates,
    'return isMissing(value) ? zero : value',
    'return value',
    aggregateTests,
  ),
  mutation(
    'min and max do not skip a null',
    aggregates,
    'if (isMissing(value)) return current',
    '',
    aggregateTests,
  ),
  mutation(
    'a NaN wins only when it comes last',
    aggregates,
    'Number.isNaN(value) || better(value, prev)',
    'better(value, prev)',
    aggregateTests,
  ),
  mutation(
    'an unknown predicate holds',
    aggregates,
    'Expr.eval(expr, row) === true',
    'Expr.eval(expr, row) !== false',
    aggregateTests,
  ),
  mutation(
    "Postgres's every skips an unknown predicate",
    aggregatesSql,
    'COALESCE(BOOL_AND(COALESCE(${x}, FALSE)), TRUE)',
    'COALESCE(BOOL_AND(${x}), TRUE)',
    aggregateTests,
  ),
  mutation(
    "Postgres's sum stays a bigint",
    aggregatesSql,
    '`COALESCE(SUM(${x}), 0)::DOUBLE PRECISION`',
    '`COALESCE(SUM(${x}), 0)`',
    aggregateTests,
  ),
  {
    ...mutation(
      "Postgres's min stays a bigint",
      aggregatesSql,
      '`MIN(${x})::DOUBLE PRECISION`',
      '`MIN(${x})`',
      aggregateTests,
    ),
    survives:
      'PGlite reads a bigint MIN as a number; the cast is for drivers that hand a bigint over as text (node-postgres), which the tests do not run',
  },
  // 8. A page's aggregates carry no SQL
  {
    ...mutation(
      'aggregates imports the SQL lowering',
      aggregates,
      "import * as Path from './path.js'",
      "import * as Path from './path.js'\nimport './sql.js'",
      aggregateTests,
    ),
    survives:
      'pnpm mutate edits the module in memory, and the test walks the imports of the source on disk; checked by hand by adding the import to the file',
  },
]
