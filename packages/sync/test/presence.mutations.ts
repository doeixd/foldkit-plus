/**
 * Presence served on a socket, broken in turn: `pnpm mutate
 * packages/sync/test/presence.mutations.ts` checks that a test fails for every one.
 */
export default [
  {
    name: 'a closed socket stays in the hub',
    edits: [
      {
        file: '../src/presence.ts',
        find: '  const stopClose = socket.onClose(stop)\n',
        replace: '  const stopClose = () => {}\n',
      },
    ],
    tests: ['packages/sync/test/presence.test.ts'],
  },
  {
    name: 'a connection joins before it may open the document',
    edits: [
      {
        file: '../src/presence.ts',
        find: 'if (options.opens === undefined) join()',
        replace: 'if (true) join()',
      },
    ],
    tests: ['packages/sync/test/presence.test.ts'],
  },
  {
    name: 'a refused connection joins anyway',
    edits: [
      {
        file: '../src/presence.ts',
        find: 'if (open && !stopped) join()',
        replace: 'if (!stopped) join()',
      },
    ],
    tests: ['packages/sync/test/presence.test.ts'],
  },
]
