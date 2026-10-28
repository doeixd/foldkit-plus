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
    "typeof database.transaction !== 'function' ||",
    'false ||',
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
  edit(
    'an insert does not ask its ledger whether it is a retry',
    drizzle,
    'if (ledger !== undefined && Option.isSome(operation)) {',
    'if (false) {',
  ),
  {
    // What a create of a taken id answered before: the row, when it held what was proposed.
    name: 'a create of a taken id is answered by what the row there holds',
    edits: [
      {
        file: drizzle,
        find: 'onNone: () =>\n            Effect.fail(\n              new RemoteServerError({ message: `${binding.name} ${id} could not be created` }),\n            ),',
        replace:
          'onNone: () =>\n            Effect.gen(function* () {\n              const there = answeredOf(yield* selectRows(yield* DrizzleDatabase, binding.table, answered.columns, { where: eq(idColumn(binding), id) }), answered)\n              if (Option.isSome(there) && holdsWritten(there.value, values, links)) return there.value\n              return yield* new RemoteServerError({ message: `${binding.name} ${id} could not be created` })\n            }),',
      },
    ],
    tests: [
      'packages/remote-drizzle/test/ledger.test.ts',
      'packages/remote-drizzle/test/writer.test.ts',
      'packages/guard/test/write.test.ts',
    ],
  },
  {
    name: 'D1 is taken for a database with transactions',
    edits: [
      {
        file: drizzle,
        find: "[entityKind] === 'D1Database'",
        replace: "[entityKind] === 'none'",
      },
    ],
    tests: ['packages/remote-drizzle/test/d1.test.ts'],
  },
]
