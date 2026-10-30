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
        find: '(last.ids.get(request.entity) ?? 0) < limits.maxIds',
        replace: 'true',
      },
    ],
    tests: [unit, page],
  },
  {
    name: 'no cut by bytes',
    edits: [{ file: coalesce, find: 'last.bytes + bytes <= limits.budget &&', replace: '' }],
    tests: [unit],
  },
  {
    name: 'no room for the envelope',
    edits: [
      { file: coalesce, find: 'const ENVELOPE_BYTES = 512', replace: 'const ENVELOPE_BYTES = 0' },
    ],
    tests: [unit],
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
        find: 'jsonBytes(request) > budget\n            ? // Refused',
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
        find: 'jsonBytes(request) > budget\n                  ? Effect.fail(new RemoteQueryError',
        replace: 'false\n                  ? Effect.fail(new RemoteQueryError',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a mutation that runs out reads as refused, so the outbox drops it',
    edits: [
      {
        file: coalesce,
        find: 'message => new RemoteUnreachable({ message }),',
        replace: 'message => new RemoteMutationError({ message }),',
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
        file: '../src/index.ts',
        find: 'Effect.map(withCallTimeout(readMessage(requirements, now), timeout), toMessage)',
        replace: 'Effect.map(readMessage(requirements, now), toMessage)',
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
