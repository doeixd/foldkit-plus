/**
 * What the Entity stamps, under a guard, broken in turn:
 * `pnpm mutate packages/guard/test/stamps.mutations.ts`.
 */
const tests = ['packages/guard/test/stamps.test.ts']
const guard = '../src/server.ts'
const drizzle = '../../remote-drizzle/src/index.ts'

export default [
  {
    name: 'an insert does not ask its ledger whether it is a retry',
    edits: [
      {
        file: drizzle,
        find: 'if (ledger !== undefined && Option.isSome(operation)) {',
        replace: 'if (false) {',
      },
    ],
    tests,
  },
  {
    name: 'the guard passes no operation on',
    edits: [
      {
        file: guard,
        find: 'return yield* Effect.mapError(writer.insert(context), told)',
        replace:
          'return yield* Effect.mapError(writer.insert({ ...context, operation: Option.none() }), told)',
      },
    ],
    tests,
  },
]
