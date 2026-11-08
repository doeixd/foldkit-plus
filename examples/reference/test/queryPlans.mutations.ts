/**
 * The index the notes' order needs, broken in turn (#437):
 * `pnpm mutate examples/reference/test/queryPlans.mutations.ts`. The test
 * builds its tables from the Drizzle declarations, which `migrations.test.ts`
 * holds the migrations to; editing a migration alone is not reachable here.
 */
const tests = ['examples/reference/test/queryPlans.test.ts']
const server = '../src/server.ts'

export default [
  {
    name: 'no index holds the newest-first order',
    edits: [
      {
        file: server,
        find: "table => [index('notes_newest').on(desc(table.createdAt), table.id)],",
        replace: 'table => [],',
      },
    ],
    tests,
  },
  {
    name: 'the index runs oldest first',
    edits: [
      {
        file: server,
        find: 'on(desc(table.createdAt), table.id)',
        replace: 'on(table.createdAt, table.id)',
      },
    ],
    tests,
  },
]
