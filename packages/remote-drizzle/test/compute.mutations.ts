/**
 * Computed assignments where they land, broken in turn: the Drizzle writer,
 * RemoteServer's registration, Guard's writer and Remote's prediction.
 * `pnpm mutate packages/remote-drizzle/test/compute.mutations.ts`.
 */
const drizzleTests = ['packages/remote-drizzle/test/compute.test.ts']
const ledgerTests = ['packages/remote-drizzle/test/ledger.test.ts']
const guardTests = ['packages/guard/test/compute.test.ts']
const remoteTests = [
  'packages/remote/test/precondition.test.ts',
  'packages/remote/test/operators.test.ts',
]
const writerFile = '../src/index.ts'
const operatorsFile = '../src/operators.ts'
const server = '../../remote-server/src/index.ts'
const guard = '../../guard/src/server.ts'
const edit = (name: string, file: string, find: string, replace: string, tests: Array<string>) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  // ---- the Drizzle writer
  edit(
    'a computed field is not set',
    writerFile,
    '...(yield* assignmentsOf(assignments)),',
    '',
    drizzleTests,
  ),
  edit(
    'an invariant is compiled over the field as it was',
    writerFile,
    '        next[field] =\n          sql`(${computationSql(computation, binding, `${binding.name}\'s "${field}"`)})` as unknown as AnyColumn\n',
    '        void computation\n',
    drizzleTests,
  ),
  edit(
    'a miss is explained without what it computes',
    writerFile,
    'proposedOf(row, { values, increments, assignments })',
    'proposedOf(row, { values, increments, assignments: {} })',
    drizzleTests,
  ),
  edit(
    'a miss is read without what it computes from',
    writerFile,
    '...Write.boundReads({ increments, assignments }),',
    '',
    drizzleTests,
  ),
  edit(
    'a computed write is retried as if it set its values',
    writerFile,
    'const incrementing = Object.keys(increments).length + Object.keys(assignments).length > 0',
    'const incrementing = Object.keys(increments).length > 0',
    drizzleTests,
  ),
  edit(
    'a computed field is not answered',
    writerFile,
    '          ...Object.keys(assignments),\n',
    '',
    drizzleTests,
  ),
  edit(
    "an assignment's operators are not checked where it is served",
    writerFile,
    '...write.assignments.flatMap(({ field, expr }) =>',
    '...write.assignments.slice(0, 0).flatMap(({ field, expr }) =>',
    drizzleTests,
  ),
  edit(
    "the SQL table's evidence is not asked for",
    writerFile,
    'tested(binding.operators.sql.evidence, kind),',
    'true,',
    drizzleTests,
  ),
  edit(
    "the memory table's evidence is not asked for",
    writerFile,
    'tested(binding.operators.memory.evidence, kind) &&',
    'true &&',
    drizzleTests,
  ),
  edit(
    'any shape of assignment commutes',
    writerFile,
    'if (own.key !== field.key || dependenciesOf(amount).fields.length > 0) return false',
    '',
    drizzleTests,
  ),

  // ---- SQL evidence
  edit(
    'evidence of an operator the SQL table lacks is kept',
    operatorsFile,
    'fail(`evidence names ${record.operator}, which this table does not implement`)',
    'operators[0]!',
    drizzleTests,
  ),
  edit(
    'evidence of an undeclared law is kept in SQL',
    operatorsFile,
    'if (!declared.includes(JSON.stringify(record.law))) {',
    'if (false) {',
    drizzleTests,
  ),
  edit(
    'a replaced SQL implementation keeps its evidence',
    operatorsFile,
    'base.evidence.filter(({ operator }) => !names.has(operator)),',
    'base.evidence,',
    drizzleTests,
  ),
  edit(
    'a SQL merge drops evidence',
    operatorsFile,
    '[...left.evidence, ...right.evidence],',
    '[],',
    drizzleTests,
  ),

  // ---- RemoteServer's registration
  edit(
    'a real increment lands without a revision',
    server,
    'if (real !== undefined && write.expect === undefined && writer.pins !== true) {',
    'if (false) {',
    ledgerTests,
  ),
  edit(
    'every increment counts as real',
    server,
    'increment => !SchemaShape.holdsIntegers(Schema.toEncoded(increment.field.schema).ast),',
    '() => true,',
    ledgerTests,
  ),
  edit(
    'a writer that computes nothing is given an assignment',
    server,
    'if (write.assignments.length > 0 && writer.assignments !== true) {',
    'if (false) {',
    drizzleTests,
  ),
  edit(
    'an unledgered assignment lands without a revision',
    server,
    '      if (writer.ledger !== true) {',
    '      if (false) {',
    drizzleTests,
  ),
  edit(
    'an assignment lands without a revision whatever commutes',
    server,
    'assignment => writer.pins !== true && writer.commutes?.(assignment) !== true,',
    '() => false,',
    drizzleTests,
  ),
  edit(
    'an assignment is sent without an operation id',
    server,
    'write.increments.length + write.assignments.length > 0 &&',
    'write.increments.length > 0 &&',
    drizzleTests,
  ),
  edit(
    'a writer is given no assignment',
    server,
    'assignments: bound.assignments,',
    'assignments: {},',
    drizzleTests,
  ),

  // ---- Guard's writer
  edit(
    'the guard judges the row before the computation',
    guard,
    '...Write.apply(before, context, { operators: policy.operators }).row,',
    '...before,\n          ...context.values,',
    guardTests,
  ),
  edit(
    'the guard reads nothing a computation reads',
    guard,
    '...Write.boundReads(context),',
    '',
    guardTests,
  ),
  edit(
    'a computed member needs no Update rule',
    guard,
    '            ...Object.keys(context.assignments),\n',
    '',
    guardTests,
  ),
  edit(
    'the guard never pins',
    guard,
    '...(revision === undefined ? {} : { pins: true }),',
    '',
    guardTests,
  ),
  edit(
    'an assignment over a hidden member passes validate',
    guard,
    '              ...computed,\n',
    '',
    ['packages/guard/test/write.test.ts'],
  ),

  // ---- Remote's prediction
  edit(
    'a pending patch carries no computation',
    '../../remote/src/mutation.ts',
    '...(Object.keys(bound.assignments).length === 0 ? {} : { computes: bound.assignments }),',
    '',
    remoteTests,
  ),
  edit(
    "a prediction runs by the kernel, not the client's table",
    '../../remote/src/optimistic.ts',
    'const predicted = predicting(() => Write.apply(row, moved, { operators }))',
    'const predicted = predicting(() => Write.apply(row, moved, { operators: Operators.kernel }))',
    remoteTests,
  ),
  edit(
    "a domain reads its store by the kernel, not Remote.make's table",
    '../../remote/src/index.ts',
    'return visibleStoreOf(remote.entities, remote.optimistic, bound.operators)',
    'return visibleStoreOf(remote.entities, remote.optimistic, Operators.kernel)',
    remoteTests,
  ),
]
