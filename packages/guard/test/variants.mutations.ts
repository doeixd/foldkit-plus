/**
 * A rule per case of a variant Entity (#357), broken:
 * `pnpm mutate packages/guard/test/variants.mutations.ts`.
 */
const tests = ['packages/guard/test/variants.test.ts']
const file = '../../entity/src/expr.ts'

export default [
  {
    name: 'a case rule reads no _tag',
    edits: [{ file, find: '  return Expr.and(is, asked)\n', replace: '  return asked\n' }],
    tests,
  },
  {
    name: 'a case rule tests another case',
    edits: [
      {
        file,
        find: 'const is = Expr.eq(read(stored._tag!) as AnyExpr, tag as never)',
        replace: "const is = Expr.eq(read(stored._tag!) as AnyExpr, 'Available' as never)",
      },
    ],
    tests,
  },
]
