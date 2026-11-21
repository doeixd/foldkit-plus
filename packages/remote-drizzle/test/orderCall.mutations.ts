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
        find: 'const key = lowered.keys[0]!',
        replace: 'const key = lowered.nodes[0]!',
      },
    ],
    tests,
  },
  {
    name: 'every page resumes from the first key',
    edits: [
      {
        file: cursor,
        find: 'keyNames(terms, base).map(([name]) => row[name])',
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
