/**
 * Parameters and computed values as each dialect takes them, broken in turn:
 * `pnpm mutate packages/remote-drizzle/test/parameters.mutations.ts`.
 */
export default [
  {
    name: 'an integer is cast to 32 bits on Postgres',
    edits: [
      {
        file: '../src/render.ts',
        find: "fits ? sql.raw('integer') : sql.raw('bigint')",
        replace: "sql.raw('integer')",
      },
    ],
    tests: ['packages/remote-drizzle/test/operators.test.ts'],
  },
  {
    name: 'a boolean is bound as is on SQLite',
    edits: [
      {
        file: '../src/target.ts',
        find: "typeof value === 'boolean' && dialectOf(target) === 'sqlite' ? Number(value) : value",
        replace: 'value',
      },
    ],
    tests: ['packages/remote-drizzle/test/operators.test.ts'],
  },
  {
    name: 'a Postgres column that is not text is folded',
    edits: [
      {
        file: '../src/cursor.ts',
        find: `          : collates
            ? Option.some({
                key: sql\`lower(\${text} collate "C")\`,`,
        replace: `          : true
            ? Option.some({
                key: sql\`lower(\${text} collate "C")\`,`,
      },
    ],
    tests: ['packages/remote-drizzle/test/cursor.test.ts'],
  },
  {
    name: 'a number term keeps the collation it inherits',
    edits: [
      {
        file: '../../entity/src/expr/order.ts',
        find: "const number = kindOf(expr.node) === 'number'",
        replace: 'const number = false',
      },
    ],
    tests: [
      'packages/entity/test/orderCall.test.ts',
      'packages/remote-drizzle/test/orderCall.test.ts',
    ],
  },
  {
    name: 'every integer is cast to 64 bits on Postgres',
    edits: [
      {
        file: '../src/render.ts',
        find: "fits ? sql.raw('integer') : sql.raw('bigint')",
        replace: "sql.raw('bigint')",
      },
    ],
    tests: ['packages/remote-drizzle/test/operators.test.ts'],
  },
  {
    name: 'an order SQLite cannot compile is refused per request only',
    edits: [
      {
        file: '../src/compile.ts',
        find: 'localeOnSqlite(columnFor(target, key, query), key, collation, query)',
        replace: 'void collation',
      },
    ],
    tests: [
      'packages/remote-drizzle/test/operators.test.ts',
      'packages/remote-drizzle/test/compile.test.ts',
    ],
  },
  {
    name: 'a Read rule compiles by the binding, not the table it was checked against',
    edits: [
      {
        file: '../../guard/src/drizzle.ts',
        find: '                  operators: { memory: policy.operators, sql: sqlOperators },\n',
        replace: '',
      },
    ],
    tests: ['packages/guard/test/drizzle.test.ts'],
  },
]
