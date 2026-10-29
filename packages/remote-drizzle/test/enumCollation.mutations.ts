/**
 * A Postgres enum ordered under a collation (#300), broken in turn:
 * `pnpm mutate packages/remote-drizzle/test/enumCollation.mutations.ts`.
 */
const tests = ['packages/remote-drizzle/test/enumCollation.test.ts']
const cursor = '../src/cursor.ts'

export default [
  {
    name: 'an enum is collated as itself, not its labels',
    edits: [
      {
        file: cursor,
        find: 'postgres && postgresEnum.has(column.columnType) ? sql`cast(${column} as text)` : sql`${column}`',
        replace: 'sql`${column}`',
      },
    ],
    tests,
  },
  {
    name: 'an enum takes no collation, and orders as declared',
    edits: [
      {
        file: cursor,
        find: '!postgres || postgresText.has(column.columnType) || postgresEnum.has(column.columnType)',
        replace: '!postgres || postgresText.has(column.columnType)',
      },
    ],
    tests,
  },
]
