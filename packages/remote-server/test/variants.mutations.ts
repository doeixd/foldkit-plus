/**
 * Variants of an Entity (#357) in the in-memory interpreter, broken:
 * `pnpm mutate packages/remote-server/test/variants.mutations.ts`.
 */
export default [
  {
    name: 'Expr.is evaluates without its tag',
    edits: [
      {
        file: '../../entity/src/expr/relation.ts',
        find: '  return and(is, asked as Predicate)\n',
        replace: '  return asked as Predicate\n',
      },
    ],
    tests: ['packages/remote-server/test/conformance.test.ts'],
  },
]
