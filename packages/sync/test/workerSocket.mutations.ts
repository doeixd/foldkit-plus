/**
 * `workerSocket`, each guard broken in turn: `pnpm mutate
 * packages/sync/test/workerSocket.mutations.ts` checks that a test fails for
 * every one.
 */
const tests = ['packages/sync/test/workerSocket.test.ts']
const file = '../src/transport.ts'

export default [
  {
    name: 'messages arrive empty',
    edits: [
      {
        file,
        find: 'for (const listener of [...messageListeners]) listener(String(event.data))',
        replace: "for (const listener of [...messageListeners]) listener('')",
      },
    ],
    tests,
  },
  {
    name: 'a close is reported every time',
    edits: [
      {
        file,
        find: `    closed = true
    forget()
    for (const listener of [...closeListeners]) listener()
    closeListeners.clear()`,
        replace: `    closed = true
    forget()
    for (const listener of [...closeListeners]) listener()`,
      },
    ],
    tests,
  },
  {
    name: 'an error is not a close',
    edits: [
      {
        file,
        find: "socket.addEventListener('error', onClosedEvent)",
        replace: "socket.addEventListener('error', () => {})",
      },
    ],
    tests,
  },
]
