/**
 * The loop's trace, broken where each owner does its part:
 * `pnpm mutate examples/writes-domain/test/loop.mutations.ts`.
 */
const layer = '../../../packages/remote-domain/src/adapter/layer.ts'
const relations = '../../../packages/remote-domain/src/adapter/relations.ts'
const tests = ['examples/writes-domain/test/loop.test.ts']

export default [
  {
    // Step 8: the retry is then a second command, decided at a revision that moved.
    name: 'the command id is random for each attempt',
    edits: [
      {
        file: layer,
        find: 'digest: yield* digest(JSON.stringify([asking, target, request.keys ?? null, encoded])),',
        replace: 'digest: yield* digest(String(Math.random())),',
      },
    ],
    tests,
  },
  {
    // Step 3: nothing then holds the row to the receipt while its View is behind.
    name: 'a write whose View is behind answers no token',
    edits: [
      {
        file: layer,
        find: 'Option.isSome(bound) && Option.isNone(confirmation) ? tokenOf(receipt) : Option.none(),',
        replace: 'Option.none<string>(),',
      },
    ],
    tests,
  },
  {
    // Step 4: a read at a receipt its View has not reached then fails instead of naming the row.
    name: 'a View behind its receipt is unreachable',
    edits: [
      {
        file: relations,
        find: "? ({ _tag: 'Behind' } as const)",
        replace: '? yield* new RemoteUnreachable({ message: `${binding.view} is behind` })',
      },
    ],
    tests,
  },
  {
    // Step 3: the Event then moves no revision, so the aggregate's row and its reply stay at 1.
    name: 'applying StockReserved leaves the revision',
    edits: [
      {
        file: '../src/model.ts',
        find: 'reserved: event.reservedAfter, revision: event.revisionAfter })',
        replace: 'reserved: event.reservedAfter })',
      },
    ],
    tests,
  },
]
