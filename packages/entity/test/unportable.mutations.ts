/**
 * NaN refused, and a `where` list asked whole, broken in turn:
 * `pnpm mutate packages/entity/test/unportable.mutations.ts` checks that a
 * test fails for every one.
 */
const evaluate = '../src/evaluate.ts'
const compile = '../../remote-drizzle/src/compile.ts'
const unportable = ['packages/entity/test/unportable.test.ts']
const sql = ['packages/remote-drizzle/test/conformance.test.ts']

export default [
  {
    name: 'an order sorts by a NaN key',
    edits: [
      {
        file: '../src/rowOrder.ts',
        find: "if (typeof key === 'number' && Number.isNaN(key)) {",
        replace: 'if (false) {',
      },
    ],
    tests: unportable,
  },
  {
    name: 'a given NaN refuses each row, not the run',
    edits: [
      {
        file: evaluate,
        find: " ||\n      (typeof each === 'number' && Number.isNaN(each))",
        replace: '',
      },
    ],
    tests: unportable,
  },
  {
    name: 'SQL compares a NaN parameter',
    edits: [
      {
        file: compile,
        find: '  }\n  refuseNaN(query, [left, right])\n  const symbol',
        replace: '  }\n  const symbol',
      },
    ],
    tests: sql,
  },
  {
    name: 'SQL tests equality with a NaN parameter',
    edits: [
      {
        file: compile,
        find: '      }\n      refuseNaN(query, [left, right])\n      // Drizzle',
        replace: '      }\n      // Drizzle',
      },
    ],
    tests: sql,
  },
  {
    name: 'SQL tests membership in a list holding NaN',
    edits: [{ file: compile, find: '      refuseNaN(query, [value, ...among])', replace: '' }],
    tests: sql,
  },
]
