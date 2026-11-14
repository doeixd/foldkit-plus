/**
 * Remote's transport wrapper (#353, #354, #355, #359), broken in turn:
 * `pnpm mutate packages/remote/test/transport.mutations.ts`.
 */
const coalesce = '../src/coalesce.ts'
const deadline = '../src/deadline.ts'
const json = '../src/json.ts'
const unit = 'packages/remote/test/coalesce.test.ts'
const calls = 'packages/remote/test/deadline.test.ts'
const page = 'packages/remote-server/test/transport.test.ts'

export default [
  {
    name: 'a call nobody waits on keeps running',
    edits: [{ file: coalesce, find: 'call.fiber?.interruptUnsafe()', replace: 'void call.fiber' }],
    tests: [unit, page],
  },
  {
    name: 'an unwanted call is cancelled at once, before a restart can join it',
    edits: [
      { file: coalesce, find: 'const CANCEL_AFTER_MS = 16', replace: 'const CANCEL_AFTER_MS = 0' },
    ],
    tests: [unit],
  },
  {
    name: 'a call is cancelled while a caller still waits on one of its keys',
    edits: [
      {
        file: coalesce,
        find: 'if (!isRunning(call) || call.keys.some(key => waiting.has(key))) return',
        replace: 'if (!isRunning(call) || call.keys.every(key => waiting.has(key))) return',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a cancelled call stays joinable',
    edits: [
      {
        file: coalesce,
        find: '    for (const key of call.keys) if (running.get(key) === call) running.delete(key)\n    call.fiber',
        replace: '    call.fiber',
      },
    ],
    tests: [unit],
    survives:
      'the interrupted fiber’s own onExit drops its keys a scheduler turn later, and a caller reaches runAll only after a turn of its own, so no test can land between the two; the eager drop keeps a caller from joining a call already dying should the order change',
  },
  {
    name: 'no cut by ids per entity',
    edits: [
      {
        file: coalesce,
        find: '(piece.ids.get(request.entity) ?? 0) < limits.maxIds',
        replace: 'true',
      },
    ],
    tests: [unit, page],
  },
  {
    name: 'a later entity opens a new piece rather than an earlier one with room (#459)',
    edits: [
      {
        file: coalesce,
        find: 'const piece = pieces.find(',
        replace: 'const piece = pieces.slice(-1).find(',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a planned read settles none of the keys it was planned for',
    edits: [
      {
        file: coalesce,
        find: 'keysByTarget.get(target(request)) ?? []',
        replace: '[]',
      },
    ],
    tests: [unit],
  },
  {
    name: 'no cut by bytes',
    edits: [{ file: coalesce, find: 'piece.bytes + bytes <= limits.budget &&', replace: '' }],
    tests: [unit],
  },
  {
    name: 'the read budget reserves a fixed 512 bytes rather than counting the envelope (#450)',
    edits: [
      {
        file: coalesce,
        find: "      envelopeBytes('read', { version: REMOTE_PROTOCOL_VERSION, requests: [] }) -",
        replace: '      512 -',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a read cut to the limit leaves no room for an RPC frame',
    edits: [{ file: coalesce, find: '      RPC_FRAME_BYTES,', replace: '      0,' }],
    tests: ['packages/remote-server/test/bodyLimit.test.ts'],
  },
  {
    name: 'a requirement too large alone is sent anyway',
    edits: [{ file: coalesce, find: 'if (bytes > limits.budget) {', replace: 'if (false) {' }],
    tests: [unit],
  },
  {
    name: 'a mutation too large is sent anyway',
    edits: [
      {
        file: coalesce,
        find: "envelopeBytes('mutate', request) > maxBodyBytes\n            ? // Refused",
        replace: 'false\n            ? // Refused',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a query too large is sent anyway',
    edits: [
      {
        file: coalesce,
        find: "envelopeBytes('query', request) > limits.maxBodyBytes\n                  ? Effect.fail(new RemoteQueryError",
        replace: 'false\n                  ? Effect.fail(new RemoteQueryError',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a call that runs out reads as refused, so the outbox drops it',
    edits: [
      {
        file: deadline,
        find: "import { RemoteUnreachable } from './wire.js'",
        replace: "import { RemoteMutationError, RemoteUnreachable } from './wire.js'",
      },
      {
        file: deadline,
        find: 'new RemoteUnreachable({ message: `No answer within',
        replace: 'new RemoteMutationError({ message: `No answer within',
      },
    ],
    tests: [unit, calls],
  },
  {
    name: 'the client’s timeout is ignored',
    edits: [
      {
        file: deadline,
        find: 'Option.getOrUndefined(yield* CallTimeout) ?? client',
        replace: 'Option.getOrUndefined(yield* CallTimeout)',
      },
    ],
    tests: [unit, page],
  },
  {
    name: 'a caller’s own timeout is ignored',
    edits: [
      {
        file: deadline,
        find: 'Option.getOrUndefined(yield* CallTimeout) ?? client',
        replace: 'client',
      },
    ],
    tests: [unit, calls],
  },
  {
    name: 'the JSON transport never hands its send the signal',
    edits: [
      {
        file: json,
        find: 'try: signal => send(JSON.stringify({ operation, payload }), signal),',
        replace:
          'try: () => send(JSON.stringify({ operation, payload }), new AbortController().signal),',
      },
    ],
    tests: [page],
  },
  {
    name: 'Remote.http never passes the signal to fetch',
    edits: [
      {
        file: json,
        find: '      body: request,\n      signal,\n',
        replace: '      body: request,\n',
      },
    ],
    tests: [page],
  },
  {
    name: 'a read entry drops its own timeout',
    edits: [
      {
        file: '../src/domain.ts',
        find: 'withCallTimeout(readMessage(requirements, after, now, generation), timeout),',
        replace: 'readMessage(requirements, after, now, generation),',
      },
    ],
    tests: [calls],
  },
  {
    name: 'Data.mutate drops its own timeout',
    edits: [
      {
        file: '../src/client.ts',
        find: '    }),\n    options.timeout,\n  )',
        replace: '    }),\n    undefined,\n  )',
      },
    ],
    tests: [calls],
  },
]
