/**
 * Variants of an Entity (#357) in SQL, each part broken in turn:
 * `pnpm mutate packages/remote-drizzle/test/variants.mutations.ts`.
 */
const tests = ['packages/remote-drizzle/test/variants.test.ts']

export default [
  {
    name: 'a case’s CHECK lets another case’s field through',
    edits: [
      {
        file: '../../entity/src/index.ts',
        find: 'foreign.map(key => Expr.isNull(row[key]!))',
        replace: 'foreign.map(key => Expr.or(Expr.isNull(row[key]!), Expr.isNotNull(row[key]!)))',
      },
    ],
    tests,
  },
  {
    name: 'a case’s CHECK lets its own field be null',
    edits: [
      {
        file: '../../entity/src/index.ts',
        find: 'held.map(key => Expr.isNotNull(row[key]!))',
        replace: 'held.map(key => Expr.or(Expr.isNull(row[key]!), Expr.isNotNull(row[key]!)))',
      },
    ],
    tests,
  },
  {
    name: 'Expr.is compiles without its tag',
    edits: [
      {
        file: '../../entity/src/expr.ts',
        find: '  return Expr.and(is, asked)\n',
        replace: '  return asked\n',
      },
    ],
    tests,
  },
]
