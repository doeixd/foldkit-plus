/**
 * Remote over a MessagePort, each guard broken in turn: `pnpm mutate
 * packages/remote-server/test/port.mutations.ts` checks that a test fails for every one.
 */
const tests = ['packages/remote-server/test/port.test.ts']
const file = '../../remote/src/port.ts'

export default [
  {
    name: 'the server never hears the client close',
    edits: [{ file, find: 'Deferred.doneUnsafe(closed, Exit.void)', replace: 'void closed' }],
    tests,
  },
  {
    name: 'the client closes without saying so',
    edits: [{ file, find: 'Effect.sync(() => worker.postMessage([1])),', replace: 'Effect.void,' }],
    tests,
  },
  {
    name: 'the server never says it is ready',
    edits: [{ file, find: 'served.postMessage([0])', replace: 'void 0' }],
    tests,
  },
]
