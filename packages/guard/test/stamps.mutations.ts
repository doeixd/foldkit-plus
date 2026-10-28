/**
 * What the Entity stamps, under a guard, broken in turn:
 * `pnpm mutate packages/guard/test/stamps.mutations.ts`.
 */
const tests = ['packages/guard/test/stamps.test.ts']
const guard = '../src/server.ts'
const drizzle = '../../remote-drizzle/src/index.ts'

export default [
  {
    name: 'a retried insert compares its stamp too',
    edits: [{ file: drizzle, find: '.filter(([key]) => !stamped.includes(key))', replace: '' }],
    tests,
  },
  {
    name: 'a retried insert compares none of its values',
    edits: [
      {
        file: drizzle,
        find: '.filter(([key]) => !stamped.includes(key))',
        replace: '.filter(() => false)',
      },
    ],
    tests,
  },
  {
    name: 'the guard passes no stamps on',
    edits: [
      {
        file: guard,
        find: 'return yield* Effect.mapError(writer.insert(context), told)',
        replace: 'return yield* Effect.mapError(writer.insert({ ...context, stamped: [] }), told)',
      },
    ],
    tests,
  },
]
