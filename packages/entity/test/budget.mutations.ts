/**
 * The expression budget, broken in turn: `pnpm mutate packages/entity/test/budget.mutations.ts`.
 */
const tests = ['packages/entity/test/query-values.test.ts']
const query = '../src/expr/query.ts'
const dependencies = '../src/expr/dependencies.ts'

export default [
  {
    name: 'no budget',
    edits: [{ file: query, find: 'if (size > maxQueryNodes) {', replace: 'if (false) {' }],
    tests,
  },
  {
    name: 'a shared node is counted once, as objects are',
    edits: [
      {
        file: dependencies,
        find: 'const known = sizes.get(node)\n  if (known !== undefined) return known',
        replace: 'const known = sizes.get(node)\n  if (known !== undefined) return 0',
      },
    ],
    tests,
  },
  {
    name: 'only the predicates of this step are counted',
    edits: [
      {
        file: query,
        find: "checkSize('where', all, self.orderBy)",
        replace: "checkSize('where', predicates, self.orderBy)",
      },
    ],
    tests,
  },
  {
    name: 'nothing is memoized, so a deep graph is walked per path',
    edits: [{ file: dependencies, find: '  sizes.set(node, size)\n', replace: '' }],
    tests,
  },
]
