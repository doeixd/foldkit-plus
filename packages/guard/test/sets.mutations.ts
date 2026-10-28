/**
 * What the write's context sets, under a guard, broken in turn:
 * `pnpm mutate packages/guard/test/sets.mutations.ts`.
 */
const tests = ['packages/guard/test/sets.test.ts']
const guard = '../src/server.ts'
const drizzle = '../../remote-drizzle/src/index.ts'
const server = '../../remote-server/src/index.ts'

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
  {
    name: 'the guard judges an update without what the context sets',
    edits: [
      {
        file: server,
        find: '                  values: { ...named.values, ...set.values },',
        replace: '                  values: named.values,',
      },
    ],
    tests,
  },
]
