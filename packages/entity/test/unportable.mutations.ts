/**
 * NaN refused, and a `where` list asked whole, broken in turn:
 * `pnpm mutate packages/entity/test/unportable.mutations.ts` checks that a
 * test fails for every one.
 */
const evaluate = '../src/evaluate.ts'
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
    name: 'SQL binds a NaN parameter',
    edits: [
      {
        file: '../../metakit/src/sqlLowering.ts',
        find: "if (typeof value === 'number' && !Number.isFinite(value)) {",
        replace: 'if (false) {',
      },
    ],
    tests: sql,
  },
]
