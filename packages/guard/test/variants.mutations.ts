/**
 * A rule per case of a variant Entity (#357), broken:
 * `pnpm mutate packages/guard/test/variants.mutations.ts`.
 */
const tests = ['packages/guard/test/variants.test.ts']
const file = '../../entity/src/expr/relation.ts'

export default [
  {
    name: 'a case rule reads no _tag',
    edits: [
      {
        file,
        find: '  return and(is, asked as Predicate)\n',
        replace: '  return asked as Predicate\n',
      },
    ],
    tests,
  },
  {
    name: 'a case rule tests another case',
    edits: [
      {
        file,
        find: 'const is = eq(exprOf(toNode(read(stored._tag!))), tag as never)',
        replace: "const is = eq(exprOf(toNode(read(stored._tag!))), 'Available' as never)",
      },
    ],
    tests,
  },
]
