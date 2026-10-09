/**
 * The expression budget, broken in turn: `pnpm mutate packages/entity/test/budget.mutations.ts`.
 */
const tests = ['packages/entity/test/query-values.test.ts']
const expr = '../src/expr.ts'

export default [
  {
    name: 'no budget',
    edits: [{ file: expr, find: 'if (size > maxQueryNodes) {', replace: 'if (false) {' }],
    tests,
  },
  {
    name: 'a shared node is counted once, as objects are',
    edits: [
      {
        file: expr,
        find: 'if (known !== undefined) return known',
        replace: 'if (known !== undefined) return 0',
      },
    ],
    tests,
  },
  {
    name: 'only the predicates of this step are counted',
    edits: [
      {
        file: expr,
        find: 'const size = where.reduce(',
        replace: 'const size = predicates.reduce(',
      },
    ],
    tests,
  },
  {
    name: 'nothing is memoized, so a deep graph is walked per path',
    edits: [{ file: expr, find: '  sizes.set(expr, size)\n', replace: '' }],
    tests,
  },
]
