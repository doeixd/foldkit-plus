export default [
  {
    name: 'replay ignores epoch mismatch',
    edits: [
      {
        file: '../src/journal.ts',
        find: 'if (options.epoch !== undefined && options.epoch !== currentEpoch) {',
        replace: 'if (false && options.epoch !== undefined && options.epoch !== currentEpoch) {',
      },
    ],
    tests: ['packages/durable/test/replay.test.ts'],
  },
  {
    name: 'replay always sets hasMore to false',
    edits: [
      {
        file: '../src/journal.ts',
        find: 'const hasMore = limit !== undefined && fetched.length > limit',
        replace: 'const hasMore = false',
      },
    ],
    tests: ['packages/durable/test/replay.test.ts'],
  },
]
