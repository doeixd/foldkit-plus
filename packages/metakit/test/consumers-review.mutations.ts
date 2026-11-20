/**
 * Mutations proving the tests of metakit's consumers (`machine`, `inspect`,
 * `sql`, `drizzle`, `prove`, `graph`) catch what an independent review found
 * unguarded:
 *   `pnpm mutate packages/metakit/test/consumers-review.mutations.ts`
 */
const machine = '../src/machine.ts'
const inspect = '../src/inspect.ts'
const sql = '../src/sql.ts'
const drizzle = '../src/drizzle.ts'
const lowering = '../src/sqlLowering.ts'
const integrationTests = ['packages/metakit/test/integrations.test.ts']
const loweringTests = ['packages/metakit/test/sql-lowering.test.ts']

const mutation = (
  name: string,
  file: string,
  find: string,
  replace: string,
  tests: ReadonlyArray<string>,
) => ({ name, edits: [{ file, find, replace }], tests })

export default [
  mutation(
    'a tag naming a member of Object.prototype is taken for a transition',
    machine,
    'Object.hasOwn(config.transitions, tag)',
    'config.transitions[tag] !== undefined',
    integrationTests,
  ),
  mutation(
    'a tag naming no transition can be dispatched',
    machine,
    'onNone: () => Verdict.False(),',
    "onNone: () => Verdict.Unknown('no such transition'),",
    integrationTests,
  ),
  mutation(
    'a nullable enum lists no null',
    inspect,
    'enum: spec.nullable ? [...literals, null] : literals',
    'enum: literals',
    integrationTests,
  ),
  mutation(
    'the literals under NullOr are not read as an enum',
    inspect,
    'present.length === 1 && SchemaAST.isUnion(inner) ? inner.types : present',
    'present',
    integrationTests,
  ),
  mutation(
    'a quote in an identifier is not doubled',
    sql,
    `name.replaceAll('"', '""')`,
    'name',
    loweringTests,
  ),
  mutation(
    'a quote in an inlined text literal is not doubled',
    lowering,
    `value.replaceAll("'", "''")`,
    'value',
    loweringTests,
  ),
  mutation(
    'a non-finite number is lowered',
    lowering,
    "if (typeof value === 'number' && !Number.isFinite(value)) {",
    'if (false) {',
    loweringTests,
  ),
  mutation(
    'a NUL in text is lowered',
    lowering,
    "typeof value === 'string' && value.includes('\\u0000')",
    'false',
    loweringTests,
  ),
  mutation(
    'an empty candidate list is written IN ()',
    lowering,
    'if (candidates.length === 0) return',
    'if (false) return',
    loweringTests,
  ),
  mutation(
    'a list of only null is written IN ()',
    lowering,
    'if (items.length === 0) return',
    'if (false) return',
    loweringTests,
  ),
  mutation(
    'SQLite is handed a boolean to bind',
    lowering,
    "dialect === 'sqlite' && typeof value === 'boolean' ? (value ? 1 : 0) : value",
    'value',
    loweringTests,
  ),
  mutation(
    'two paths share one column name',
    lowering,
    'if (prior !== undefined && prior !== path) {',
    'if (false) {',
    loweringTests,
  ),
  mutation(
    'a fraction meets an integer term',
    lowering,
    'return mixed(left, right) || mixed(right, left)',
    'return false',
    loweringTests,
  ),
  mutation(
    'a fraction is a candidate for an integer term',
    lowering,
    'if (isIntegerTerm(args[0]!) && present.some(isFraction)) return',
    'if (false) return',
    loweringTests,
  ),
  mutation(
    'an UPDATE is built from an input the input Schema refuses',
    lowering,
    '!Schema.is(transition.inputSchema.value)(input)',
    'false',
    loweringTests,
  ),
  mutation(
    'a CHECK passes a rule that is unknown of a null',
    lowering,
    "q`(${joined(rules, ' AND ')}) IS TRUE`",
    "q`(${joined(rules, ' AND ')})`",
    loweringTests,
  ),
  mutation(
    'Drizzle reads a column the table lacks',
    drizzle,
    'Object.hasOwn(columns, name)',
    'true',
    loweringTests,
  ),
  mutation(
    'Drizzle binds a literal of a CHECK as a parameter',
    drizzle,
    'options.inline',
    'false',
    loweringTests,
  ),
]
