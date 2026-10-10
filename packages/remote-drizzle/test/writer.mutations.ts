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
        find: 'const bound = Write.bind(write, given, keys)',
        replace: 'const bound = Write.bind(write, given)',
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
    edits: [
      {
        file: drizzle,
        find: 'where: and(eq(idColumn(binding), id), eq(column, revision)),',
        replace: 'where: eq(idColumn(binding), id),',
      },
    ],
    tests,
  },
  {
    name: 'the revision does not move on',
    edits: [{ file: drizzle, find: 'bump: { [key]: sql`${column} + 1` },', replace: 'bump: {},' }],
    tests,
  },
  {
    name: 'an older edit moves a row back',
    edits: [{ file: drizzle, find: 'lte(revision, at)', replace: 'undefined' }],
    tests,
  },
  {
    name: 'a second change in one operation is skipped',
    edits: [{ file: drizzle, find: 'lte(revision, at)', replace: 'sql`${revision} < ${at}`' }],
    tests,
  },
  {
    name: 'the revision is not written',
    edits: [{ file: drizzle, find: '[revisionKey]: at', replace: '' }],
    tests,
  },
  {
    name: 'a table with no revision column is accepted',
    edits: [
      {
        file: drizzle,
        find: 'if (revision === undefined || revisionKey === undefined) {',
        replace: 'if (false) {',
      },
    ],
    tests,
  },
  {
    name: 'a relation is written as its ref, not its id',
    edits: [
      {
        file: drizzle,
        find: 'onSome: ref => ref.id',
        replace: 'onSome: ref => `${ref.entity}:${ref.id}`',
      },
    ],
    tests,
  },
  {
    name: 'a pointed relation is not answered',
    edits: [{ file: drizzle, find: '...Object.keys(links),', replace: '' }],
    tests,
  },
  {
    name: 'a retried insert is not answered with the row it made',
    edits: [{ file: drizzle, find: 'inserted.length > 0', replace: 'true' }],
    tests,
  },
  {
    name: 'a retried insert fails on the id it took',
    edits: [{ file: drizzle, find: '.onConflictDoNothing()', replace: '' }],
    tests,
  },
  {
    name: 'a delete from a moved revision succeeds',
    edits: [
      { file: server, find: 'if (!deleted && Option.isSome(expect))', replace: 'if (false)' },
    ],
    tests,
  },
  {
    name: 'a delete of a row already gone fails',
    edits: [
      { file: server, find: 'if (!deleted && Option.isSome(expect))', replace: 'if (!deleted)' },
    ],
    tests,
  },
]
