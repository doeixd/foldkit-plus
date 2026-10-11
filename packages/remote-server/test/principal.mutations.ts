/**
 * Who is asking, as handlers and the live hub read it, broken in turn:
 * `pnpm mutate packages/remote-server/test/principal.mutations.ts`.
 */
const file = '../src/index.ts'
const tests = ['packages/remote-server/test/server.test.ts']
const hub = ['packages/remote-server/test/liveHub.test.ts']

export default [
  {
    name: 'a Context key is taken for the principal itself',
    edits: [{ file, find: 'Context.isKey(principal)', replace: 'false' }],
    tests,
  },
  {
    name: 'a read is answered as no one',
    edits: [
      {
        file,
        find: 'RemoteServer.readHelper(server, caller, options, payload.requests)',
        replace: 'RemoteServer.readHelper(server, undefined as P, options, payload.requests)',
      },
    ],
    tests,
  },
  {
    name: 'a query is run as no one',
    edits: [
      {
        file,
        find: 'window: payload.window,\n            principal: caller,',
        replace: 'window: payload.window,\n            principal: undefined as P,',
      },
    ],
    tests,
  },
  {
    name: 'a mutation is run as no one',
    edits: [
      {
        file,
        find: '.run({ input, principal: caller, requestId',
        replace: '.run({ input, principal: undefined as P, requestId',
      },
    ],
    tests,
  },
  {
    name: 'the hub ignores its key',
    edits: [
      {
        file,
        find: 'const keyOf = options.key ?? ((principal: P): unknown => principal)',
        replace: 'const keyOf = (principal: P): unknown => principal',
      },
    ],
    tests: hub,
  },
  {
    name: 'a shared re-read is made as the last subscriber',
    edits: [
      {
        file,
        find: 'groups.set(principalKey, sharing)',
        replace: 'groups.set(principalKey, { ...sharing, principal: subscriber.principal })',
      },
    ],
    tests: hub,
  },
]
