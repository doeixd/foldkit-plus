/**
 * The socket `layerSocket` shares as `TransportSocket`, broken in turn:
 * `pnpm mutate packages/sync/test/transportSocket.mutations.ts`. That what a
 * transport receives is unread (#517) is held by `written.test-d.ts`, which
 * `pnpm mutate` does not run: typing `serveSocket`'s `pending` as
 * `WrittenOperation` again leaves its `@ts-expect-error` unused, as does
 * branding what `journalContract().operation.compared` returns, letting
 * `operation.decode` read `unknown`, leaving `codec.committedFrom` unmarked, or
 * letting `operation.encode` take any `Operation`.
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
  // What a served exchange that threw tells its replica (#575).
  {
    name: 'a handler’s own error is sent to the replica',
    edits: [
      {
        file,
        find: 'send({ id: frame.id, error: EXCHANGE_FAILED, incident })',
        replace: 'send({ id: frame.id, error: String(thrown), incident })',
      },
    ],
    tests,
  },
  {
    name: 'everything a handler throws is read as written for the replica',
    edits: [
      {
        file,
        find: 'if (thrown instanceof ExchangeRefused || thrown instanceof UnsupportedMessageVersionError) {',
        replace: 'if (thrown instanceof Error) {',
      },
    ],
    tests,
  },
  {
    name: 'words written for the replica are withheld',
    edits: [
      {
        file,
        find: 'if (thrown instanceof ExchangeRefused || thrown instanceof UnsupportedMessageVersionError) {',
        replace: 'if (false) {',
      },
    ],
    tests,
  },
  {
    name: 'a handler that threw is not reported',
    edits: [
      {
        file,
        find: 'await Effect.runPromise(reportTo(options.diagnostics, exchangeDefect(incident, thrown)))',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the client drops the incident it was answered',
    edits: [
      {
        file,
        find: "...(typeof reply.incident === 'string' ? { incident: reply.incident } : {}),",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the journal’s refusal of a connection is thrown as any error',
    edits: [
      {
        file: '../src/journal.ts',
        find: "new ExchangeRefused({ message: 'This connection may not open the document' })",
        replace: "new Error('This connection may not open the document')",
      },
    ],
    tests: ['packages/sync/test/prototype/rpcCriteria.test.ts'],
  },
]
