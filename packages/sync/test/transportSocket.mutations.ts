/**
 * The socket `layerSocket` shares as `TransportSocket`, broken in turn:
 * `pnpm mutate packages/sync/test/transportSocket.mutations.ts`. That what a
 * transport receives is unread (#517) is held by `written.test-d.ts`, which
 * `pnpm mutate` does not run: typing `serveSocket`'s `pending` as
 * `WrittenOperation` again leaves its `@ts-expect-error` unused.
 */
const file = '../src/transport.ts'
const tests = ['packages/sync/test/transport.test.ts', 'packages/sync/test/diagnostics.test.ts']

export default [
  {
    name: 'the shared socket hears nothing',
    edits: [
      {
        file,
        find: 'Context.add(TransportSocket, shared)',
        replace: 'Context.add(TransportSocket, { ...shared, onMessage: () => () => {} })',
      },
    ],
    tests,
  },
  {
    name: 'the shared socket sends nothing',
    edits: [
      {
        file,
        find: 'Context.add(TransportSocket, shared)',
        replace: 'Context.add(TransportSocket, { ...shared, send: () => {} })',
      },
    ],
    tests,
  },
]
