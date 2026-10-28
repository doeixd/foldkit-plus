/**
 * A retry racing its original on a real Postgres, its order broken:
 * `FOLDKIT_LOCALE_PG=… pnpm mutate packages/remote-drizzle/test/ledgerRace.mutations.ts`.
 * Without a Postgres named its test does not run, and the mutation survives.
 */
export default [
  {
    name: 'a retry does not wait for its original',
    edits: [
      {
        file: '../src/index.ts',
        find: 'if (!is(book.table, SQLiteTable)) {',
        replace: 'if (false) {',
      },
    ],
    tests: ['packages/remote-drizzle/test/ledgerRace.test.ts'],
  },
]
