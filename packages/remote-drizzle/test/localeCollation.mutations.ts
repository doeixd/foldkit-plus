/**
 * The collation each Postgres comparison and order names, dropped in turn so
 * the database's own decides: `FOLDKIT_LOCALE_PG=… pnpm mutate
 * packages/remote-drizzle/test/localeCollation.mutations.ts` (conformance.test.ts
 * says how to start such a database). Every one survives on PGlite alone, whose
 * database collates by `C` already; that is why they need a locale.
 * expr-operations-DESIGN §15, question 11.
 */
export default [
  {
    name: 'binary order takes the database collation',
    edits: [
      {
        file: '../src/cursor.ts',
        find: 'Option.some({ key: sql`${text} collate "C"`, value: plain })',
        replace: 'Option.some({ key: sql`${text}`, value: plain })',
      },
    ],
    tests: [
      'packages/remote-drizzle/test/conformance.test.ts',
      'packages/remote-drizzle/test/orderCall.test.ts',
    ],
  },
  {
    name: 'binary text takes the database collation',
    edits: [
      {
        file: '../src/compile.ts',
        find: 'sql`(${text} collate "C")`',
        replace: 'sql`(${text})`',
      },
    ],
    tests: [
      'packages/remote-drizzle/test/conformance.test.ts',
      'packages/remote-drizzle/test/orderCall.test.ts',
    ],
  },
  {
    name: 'asciiFold order lowers by the database collation',
    edits: [
      {
        file: '../src/cursor.ts',
        find: 'key: sql`lower(${text} collate "C")`',
        replace: 'key: sql`lower(${text})`',
      },
    ],
    tests: [
      'packages/remote-drizzle/test/conformance.test.ts',
      'packages/remote-drizzle/test/orderCall.test.ts',
    ],
  },
  {
    name: 'asciiFold text lowers by the database collation',
    edits: [
      {
        file: '../src/compile.ts',
        find: '? sql`lower(${text} collate "C")`',
        replace: '? sql`lower(${text})`',
      },
    ],
    tests: [
      'packages/remote-drizzle/test/conformance.test.ts',
      'packages/remote-drizzle/test/orderCall.test.ts',
    ],
  },
]
