/**
 * Parameters and computed values as each dialect takes them, broken in turn:
 * `pnpm mutate packages/remote-drizzle/test/parameters.mutations.ts`.
 */
export default [
  {
    name: 'an integer is cast to 32 bits on Postgres',
    edits: [
      {
        file: '../src/compile.ts',
        find: "sql.raw('bigint')",
        replace: "sql.raw('integer')",
      },
    ],
    tests: ['packages/remote-drizzle/test/operators.test.ts'],
  },
  {
    name: 'a boolean is bound as is on SQLite',
    edits: [
      {
        file: '../src/compile.ts',
        find: "typeof value === 'boolean' ? Number(value) : value",
        replace: 'value',
      },
    ],
    tests: ['packages/remote-drizzle/test/operators.test.ts'],
  },
  {
    name: 'a computed Next is collated as a column',
    edits: [
      {
        file: '../src/compile.ts',
        find: "second._tag === 'Call' || !is(left, Column)) {",
        replace: "second._tag === 'Call') {",
      },
    ],
    tests: ['packages/remote-drizzle/test/compute.test.ts'],
  },
  {
    name: 'a Postgres column that is not text is folded',
    edits: [
      {
        file: '../src/cursor.ts',
        find: `          : postgresText.has(column.columnType)
            ? Option.some({
                key: sql\`lower(\${column} collate "C")\`,`,
        replace: `          : true
            ? Option.some({
                key: sql\`lower(\${column} collate "C")\`,`,
      },
    ],
    tests: ['packages/remote-drizzle/test/cursor.test.ts'],
  },
  {
    name: 'a number term keeps the collation it inherits',
    edits: [
      {
        file: '../../entity/src/expr.ts',
        find: "const number = sideKind(expr) === 'number'",
        replace: 'const number = false',
      },
    ],
    tests: [
      'packages/entity/test/orderCall.test.ts',
      'packages/remote-drizzle/test/orderCall.test.ts',
    ],
  },
]
