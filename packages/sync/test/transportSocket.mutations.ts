/**
 * The socket `layerSocket` shares as `TransportSocket`, broken in turn:
 * `pnpm mutate packages/sync/test/transportSocket.mutations.ts`.
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
