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
        file: '../../entity/src/invariant.ts',
        find: 'foreign.map(key => isNull(row[key]!))',
        replace: 'foreign.map(key => or(isNull(row[key]!), isNotNull(row[key]!)))',
      },
    ],
    tests,
  },
  {
    name: 'a case’s CHECK lets its own field be null',
    edits: [
      {
        file: '../../entity/src/invariant.ts',
        find: 'held.map(key => isNotNull(row[key]!))',
        replace: 'held.map(key => or(isNull(row[key]!), isNotNull(row[key]!)))',
      },
    ],
    tests,
  },
  {
    name: 'Expr.is compiles without its tag',
    edits: [
      {
        file: '../../entity/src/expr/relation.ts',
        find: '  return and(is, asked as Predicate)\n',
        replace: '  return asked as Predicate\n',
      },
    ],
    tests,
  },
]
