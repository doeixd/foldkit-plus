/**
 * A writer's ledger, each step broken in turn:
 * `pnpm mutate packages/remote-drizzle/test/ledger.mutations.ts` checks that
 * a test fails for every one.
 */
const drizzle = '../src/index.ts'
const server = '../../remote-server/src/index.ts'
const guard = '../../guard/src/server.ts'
const tests = [
  'packages/remote-drizzle/test/ledger.test.ts',
  'packages/guard/test/increment.test.ts',
]
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'SQLite does not consult the ledger',
    drizzle,
    '                .all()\n              if (found[0] !== undefined)\n',
    '                .all()\n              if (false)\n',
  ),
  edit(
    'Postgres does not consult the ledger',
    drizzle,
    "if (found[0] !== undefined) return { _tag: 'Recorded', answer: String(found[0].answer) }",
    '',
  ),
  edit('SQLite records nothing', drizzle, 'tx.insert(book.table).values(record(answer)).run()', ''),
  edit(
    'Postgres records nothing',
    drizzle,
    'await tx.insert(book.table).values(record(answer.value))',
    '',
  ),
  edit('a record is anyone’s', drizzle, '      eq(book.table.scope, scope),\n', ''),
  edit('a record outlives its retention', drizzle, '      gte(book.table.at, cutoff),\n', ''),
  edit(
    'a database with no transactions writes unrecorded',
    drizzle,
    "if (typeof database.transaction !== 'function') {",
    'if (false) {',
  ),
  edit(
    'an increment with no revision is served over a writer with no ledger',
    server,
    'if (write.increments.length > 0 && write.expect === undefined && writer.ledger !== true) {',
    'if (false) {',
  ),
  edit(
    'an increment with no revision is taken with no operation id',
    server,
    '                  Option.isNone(operation)\n',
    '                  false\n',
  ),
  edit(
    'the guard decides a recorded retry again',
    guard,
    'if (recorded === undefined || Option.isNone(context.operation)) return write()',
    'return write()',
  ),
  edit(
    'a guarded writer hides its writer’s ledger',
    guard,
    '...(writer.ledger === true ? { ledger: true } : {}),',
    '',
  ),
  edit(
    'an unpinned guard judges an unexpected increment’s sum',
    guard,
    'Option.isNone(context.expect) &&',
    'false &&',
  ),
  edit(
    'a record answers for every row',
    drizzle,
    '      eq(book.table.target, Entity.refKey({ entity: binding.name, id })),\n',
    '',
  ),
]
