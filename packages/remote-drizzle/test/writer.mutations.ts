/**
 * Declared writes on a Drizzle table, broken in turn:
 * `pnpm mutate packages/remote-drizzle/test/writer.mutations.ts`.
 */
const tests = ['packages/remote-drizzle/test/writer.test.ts']
const server = '../../remote-server/src/index.ts'
const drizzle = '../src/index.ts'

export default [
  {
    name: 'the keys the client named are not what is written',
    edits: [
      {
        file: server,
        find: 'const bound = Write.bind(write, input as never, keys)',
        replace: 'const bound = Write.bind(write, input as never)',
      },
    ],
    tests,
  },
  {
    name: 'a row that moved on fails instead of being refused as a conflict',
    edits: [
      { file: server, find: 'return yield* Option.isSome(expect)', replace: 'return yield* false' },
    ],
    tests,
  },
  {
    name: 'a writer for another Entity is accepted',
    edits: [
      {
        file: server,
        find: 'if (write.input.entity.name !== writer.entity) {',
        replace: 'if (false) {',
      },
    ],
    tests,
  },
  {
    name: 'a row is written at any revision',
    edits: [{ file: drizzle, find: 'guard = eq(column, revision)', replace: 'guard = undefined' }],
    tests,
  },
  {
    name: 'the revision does not move on',
    edits: [{ file: drizzle, find: 'set[key] = sql`${column} + 1`', replace: '' }],
    tests,
  },
]
