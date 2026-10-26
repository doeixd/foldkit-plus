/**
 * Ordering and paging by a call in SQL, broken in turn:
 * `pnpm mutate packages/remote-drizzle/test/orderCall.mutations.ts`.
 */
const tests = ['packages/remote-drizzle/test/orderCall.test.ts']
const cursorTests = ['packages/remote-drizzle/test/cursor.test.ts']
const compile = '../src/compile.ts'
const cursor = '../src/cursor.ts'

export default [
  {
    name: "a call's order ignores its collation",
    edits: [
      {
        file: compile,
        find: 'return { key: collateFor(term.collation, dialectOf(target))(compiled), direction, nulls }',
        replace: 'return { key: compiled, direction, nulls }',
      },
    ],
    tests,
  },
  {
    name: 'a defined operator is ordered by unexpanded',
    edits: [
      {
        file: compile,
        find: 'const call = Expr.expanded(term.expr)',
        replace: 'const call = term.expr',
      },
    ],
    tests,
  },
  {
    name: 'every page resumes from the first key',
    edits: [
      {
        file: cursor,
        find: 'terms.map((_, index) => row[`key${index}`])',
        replace: 'terms.map(() => row.key0)',
      },
    ],
    tests,
  },
  {
    name: 'a collation beside an expression key is ignored',
    edits: [
      { file: cursor, find: '  if (term.collation !== undefined) {', replace: '  if (false) {' },
    ],
    tests: cursorTests,
  },
]
