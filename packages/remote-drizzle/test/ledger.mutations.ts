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
    'recordedOf(tx.select(asked).from(book.table).where(key).all()),',
    'Option.none(),',
  ),
  edit(
    'Postgres does not consult the ledger',
    drizzle,
    'if (Option.isSome(found)) return found.value',
    '',
  ),
  edit(
    'a record of another request answers as the retry',
    drizzle,
    "found['request'] === null || found['request'] === digest",
    'true',
  ),
  edit(
    'a record made before the ledger kept requests is refused',
    drizzle,
    "found['request'] === null || found['request'] === digest",
    "found['request'] === digest",
  ),
  edit(
    'a reused operation id writes as a new operation',
    drizzle,
    "if (done._tag === 'Reused') return yield* reused(operation, id)",
    "if (done._tag === 'Reused') return { _tag: 'Written', rows: [] } as const",
  ),
  edit('the ledger records no request', drizzle, '        request: digest,\n      })', '      })'),
  edit(
    'the request is not the mutation’s',
    server,
    'JSON.stringify([mutation.name, keys ?? null, encoded])',
    'JSON.stringify([keys ?? null, encoded])',
  ),
  edit(
    'the request is not the input',
    server,
    'JSON.stringify([mutation.name, keys ?? null, encoded])',
    'JSON.stringify([mutation.name, keys ?? null])',
  ),
  edit(
    'a guard is answered from a record of another request',
    drizzle,
    'if (Option.isSome(record) && !recordedFor(record.value, digest)) {',
    'if (false) {',
  ),
  edit(
    'a ledgered miss that agrees with the row is taken for a retry',
    drizzle,
    'Option.isNone(book) && sets && !incrementing && holdsWritten(row, values, links)',
    'sets && !incrementing && holdsWritten(row, values, links)',
  ),
  edit(
    'a ledgered conflict one revision on is taken for a retry',
    drizzle,
    'if (incrementing || Option.isSome(book)) return Option.none()',
    'if (incrementing) return Option.none()',
  ),
  {
    name: 'an unledgered retry of a write that landed is judged as new',
    edits: [
      {
        file: drizzle,
        find: 'Option.isNone(book) && sets && !incrementing && holdsWritten(row, values, links)',
        replace: 'false',
      },
    ],
    tests: [
      'packages/remote-drizzle/test/precondition.test.ts',
      'packages/remote-drizzle/test/transition.test.ts',
    ],
  },
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
    "&& typeof database.transaction !== 'function'",
    '&& false',
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
  ...[
    {
      name: 'D1 is taken for a database with transactions',
      find: "] === 'D1Database'",
      replace: "] === 'none'",
    },
    {
      name: 'D1 records a write that changed nothing',
      find: ' and changes() > 0`',
      replace: '`',
    },
    {
      name: 'D1 writes the row and its record apart',
      find: 'database.batch([',
      replace: 'Promise.all([',
    },
    {
      name: 'D1 prunes after it records',
      find: 'database.delete(table).where(expired),\n                  update(database),\n                  database.run(recording),',
      replace:
        'update(database),\n                  database.run(recording),\n                  database.delete(table).where(expired),',
    },
    {
      name: 'D1 answers a copy that lost the race with its failure',
      find: 'if (Option.isSome(after)) return after.value',
      replace: '',
    },
    {
      name: 'D1 records no request',
      find: '${now}, ${digest} from',
      replace: '${now}, null from',
    },
    {
      name: 'a D1 record is answered as its columns held it',
      find: '    if (!isD1(database)) return Effect.succeed(stored)',
      replace: '    return Effect.succeed(stored)',
    },
    {
      name: 'D1 writes before it reads the record',
      find: 'if (Option.isSome(known)) return known.value',
      replace: '',
      survives:
        'the batch answers a retry too, by its record colliding with the first: the read spares that retry a write rolled back',
    },
  ].map(({ name, find, replace, ...rest }) => ({
    name,
    edits: [{ file: drizzle, find, replace }],
    tests: ['packages/remote-drizzle/test/d1.test.ts'],
    ...rest,
  })),
]
