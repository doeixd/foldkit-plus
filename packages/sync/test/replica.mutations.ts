/**
 * The replica's streams, broken in turn: `pnpm mutate
 * packages/sync/test/replica.mutations.ts` checks that a test fails for every one.
 */
export default [
  {
    name: 'a stream subscribes to changes only after its first value is taken',
    edits: [
      {
        file: '../src/sync.ts',
        find: 'Stream.fromSubscription(signals)',
        replace: 'Stream.fromPubSub(statusSignals)',
      },
    ],
    tests: ['packages/sync/test/sync.test.ts'],
  },
]
