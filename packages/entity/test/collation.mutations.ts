/**
 * Declared collation, broken in turn, in the IR, the reference evaluator, the
 * placement verdict and the Drizzle compiler:
 * `pnpm mutate packages/entity/test/collation.mutations.ts`.
 */
const tests = [
  'packages/entity/test/collation.test.ts',
  'packages/entity/test/expr.test.ts',
  'packages/remote-drizzle/test/compile.test.ts',
  'packages/remote-drizzle/test/conformance.test.ts',
  'packages/remote/test/matching.test.ts',
]
const expr = '../src/expr.ts'
const evaluate = '../src/evaluate.ts'
const cursor = '../../remote-drizzle/src/cursor.ts'
const compile = '../../remote-drizzle/src/compile.ts'

export default [
  {
    name: 'an id has no collation',
    edits: [
      {
        file: expr,
        find: "field.key === 'id' ? Option.some(Collation.binary) : Option.none(),",
        replace: 'Option.none(),',
      },
    ],
    tests,
  },
  {
    name: 'a term cannot override its field',
    edits: [
      {
        file: expr,
        find: 'collation: Option.orElse(Option.fromUndefinedOr(options.collation), () =>',
        replace: 'collation: Option.orElse(Option.none<Collation>(), () =>',
      },
    ],
    tests,
  },
  {
    name: 'asciiFold folds nothing',
    edits: [
      {
        file: evaluate,
        find: "const fold = Option.exists(collation, declared => declared._tag === 'AsciiFold')",
        replace: 'const fold = false',
      },
    ],
    tests,
  },
  {
    name: 'text compares by UTF-16 code unit',
    edits: [
      {
        file: evaluate,
        find: ': byCodePoint(left, right)',
        replace: ': left < right ? -1 : left > right ? 1 : 0',
      },
    ],
    tests,
  },
  {
    name: 'the evaluator orders by a locale it does not have',
    edits: [
      {
        file: evaluate,
        find: "if (Option.exists(term.collation, declared => declared._tag === 'Locale')) {",
        replace: 'if (false) {',
      },
    ],
    tests,
  },
  {
    name: 'text with no collation counts as placeable',
    edits: [
      {
        file: expr,
        find: 'ordersIntrinsically(Schema.toEncoded(field.schema).ast)',
        replace: 'true',
      },
    ],
    tests,
  },
  {
    name: 'a locale collation counts as placeable',
    edits: [
      {
        file: expr,
        find: 'Locale: ({ locale }) =>\n                Option.some(',
        replace: 'Locale: ({ locale }) =>\n                Option.none<string>() ?? Option.some(',
      },
    ],
    tests,
  },
  {
    name: 'a body with no order counts as placeable',
    edits: [{ file: expr, find: 'if (self.orderBy.length === 0) {', replace: 'if (false) {' }],
    tests,
  },
  {
    name: 'binary is not said on Postgres',
    edits: [
      {
        file: cursor,
        find: '? Option.some({ key: sql`${column} collate "C"`, value: plain })',
        replace: '? Option.none()',
      },
    ],
    tests,
  },
  {
    name: 'a uuid id is given a collation it cannot take',
    edits: [{ file: cursor, find: ': postgresText.has(column.columnType)', replace: ': true' }],
    tests,
  },
  {
    name: 'a folded cursor value is compared unfolded on Postgres',
    edits: [
      {
        file: cursor,
        find: 'value: (value: unknown) => sql`lower(${value})`,',
        replace: 'value: plain,',
      },
    ],
    tests,
  },
  {
    name: 'asciiFold is not said on SQLite',
    edits: [
      {
        file: cursor,
        find: ': { key: sql`${column} collate nocase`, value: plain },',
        replace: ': { key: sql`${column}`, value: plain },',
      },
    ],
    tests,
  },
  {
    name: 'SQLite is asked for a locale',
    edits: [
      {
        file: compile,
        find: "if (collation?._tag === 'Locale' && !is(column, PgColumn)) {",
        replace: 'if (false) {',
      },
    ],
    tests,
  },
]
