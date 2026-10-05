/**
 * `portSocket`, broken in turn: `pnpm mutate
 * packages/sync/test/portSocket.mutations.ts` checks that a test fails for every one.
 */
const tests = ['packages/sync/test/portSocket.test.ts']
const file = '../src/transport.ts'
export default [
  {
    name: 'data that is not a string reaches the socket',
    edits: [
      {
        file,
        find: "if (typeof event.data === 'string') listener(event.data)",
        replace: 'listener(String(event.data))',
      },
    ],
    tests,
  },
  {
    name: 'a second close fires onClose again',
    edits: [{ file, find: '    closeListeners.clear()\n', replace: '' }],
    tests,
  },
  {
    name: 'an aborted signal closes nothing',
    edits: [
      {
        file,
        find: "options.signal?.addEventListener('abort', close, { once: true })",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a listener after the close never hears of it',
    edits: [
      { file, find: '      if (closed) {\n        listener()', replace: '      if (closed) {' },
    ],
    tests,
  },
  {
    name: 'a signal aborted before the socket was made is ignored',
    edits: [{ file, find: '  if (options.signal?.aborted === true) close()\n', replace: '' }],
    tests,
  },
  {
    name: 'makeSocket is ignored for a WebSocket',
    edits: [
      {
        file,
        find: '  if (options.makeSocket !== undefined) return options.makeSocket\n',
        replace: '',
      },
    ],
    tests,
  },
]
