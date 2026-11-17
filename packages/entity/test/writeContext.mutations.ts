/**
 * A write's `when` reading the context is refused at declaration (#572):
 * `pnpm mutate packages/entity/test/writeContext.mutations.ts`.
 */
const tests = ['packages/entity/test/writeContext.test.ts']
const write = '../src/write.ts'

export default [
  {
    name: 'a when reading the context is declared',
    edits: [{ file: write, find: 'if (asking.length > 0) {', replace: 'if (false) {' }],
    tests,
  },
  {
    name: 'the time is not a context term',
    edits: [
      {
        file: write,
        find: "operation === 'viewer' || operation === 'now'",
        replace: "operation === 'viewer'",
      },
    ],
    tests,
  },
  {
    name: 'the viewer is not a context term',
    edits: [
      {
        file: write,
        find: "operation === 'viewer' || operation === 'now'",
        replace: "operation === 'now'",
      },
    ],
    tests,
  },
]
