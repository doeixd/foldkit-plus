/**
 * Each §14.3 criterion broken in Sync's transports and in the RPC prototype:
 * `pnpm mutate packages/sync/test/prototype/rpcCriteria.mutations.ts`.
 *
 * The test that request headers override the connection's pins Effect's own
 * behaviour, which no spec can edit: it was mutated by hand, by swapping the
 * concatenation in `node_modules/effect/dist/rpc/RpcServer.js:875` to
 * `message.headers.concat(requestHeaders)`, and went red.
 */
const tests = ['packages/sync/test/prototype/rpcCriteria.test.ts']

export default [
  {
    name: 'RPC: pending entries are typed, so one bad operation fails the call',
    edits: [
      {
        file: './effectRpc.ts',
        find: 'pending: Schema.Array(Schema.Unknown),',
        replace:
          'pending: Schema.Array(Schema.Struct({ opId: Schema.String, message: Schema.Struct({ title: Schema.NonEmptyString }) })),',
      },
    ],
    tests,
  },
  {
    name: 'RPC: the payload names no epoch',
    edits: [
      {
        file: './effectRpc.ts',
        find: '  epoch: Schema.optionalKey(Schema.String),\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'RPC: the cursor is sent as text',
    edits: [
      {
        file: './effectRpc.ts',
        find: 'cursor: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),',
        replace: 'cursor: Schema.NumberFromString,',
      },
    ],
    tests,
  },
  {
    name: 'RPC: the client sends no pending operation',
    edits: [
      {
        file: './effectRpc.ts',
        find: '.Exchange({ cursor, pending, ...',
        replace: '.Exchange({ cursor, pending: [], ...',
      },
    ],
    tests,
  },
  {
    name: 'RPC: the client drops the epoch',
    edits: [
      {
        file: './effectRpc.ts',
        find: '...(epoch === undefined ? {} : { epoch })',
        replace: '...{}',
      },
    ],
    tests,
  },
  {
    name: 'RPC: a server failure loses its words',
    edits: [
      {
        file: './effectRpc.ts',
        find: '        catch: failure,',
        replace: "        catch: () => new TransportError({ message: 'Exchange failed' }),",
      },
    ],
    tests,
  },
  {
    name: 'RPC: no notice on a commit',
    edits: [
      {
        file: './effectRpc.ts',
        find: 'return options.changes?.(() => void Queue.offerUnsafe(queue, undefined))',
        replace: 'return undefined',
      },
    ],
    tests,
  },
  {
    name: 'RPC: no notice on (re)subscribing',
    edits: [
      {
        file: './effectRpc.ts',
        find: '            Queue.offerUnsafe(queue, undefined)\n            return',
        replace: '            return',
      },
    ],
    tests,
  },
  {
    name: 'RPC: notices end with the first connection',
    edits: [
      {
        file: './effectRpc.ts',
        find: "    Stream.retry(Schedule.spaced(options.resubscribe ?? '1 second')),\n",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'socket transport: an unanswered frame is not sent again on reconnect',
    edits: [
      {
        file: '../../src/transport.ts',
        find: '              requeue()',
        replace: '              inFlight.clear()',
      },
    ],
    tests,
  },
  {
    name: 'socket transport: the frame drops the epoch',
    edits: [
      {
        file: '../../src/transport.ts',
        find: '...(entry.epoch === undefined ? {} : { epoch: entry.epoch }),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'socket server: a negative cursor reaches the exchange',
    edits: [{ file: '../../src/transport.ts', find: 'cursor < 0 ||', replace: '' }],
    tests,
  },
  {
    name: 'journal: a retried operation is not recognised',
    edits: [
      {
        file: '../../../durable/src/journal.ts',
        find: 'if (prior.length > 0) {',
        replace: 'if (false) {',
      },
    ],
    tests,
  },
]
