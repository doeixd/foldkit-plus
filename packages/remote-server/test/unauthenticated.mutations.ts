/**
 * A caller who could not be told, each step broken in turn: `pnpm mutate
 * packages/remote-server/test/unauthenticated.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = [
  'packages/remote-server/test/unauthenticated.test.ts',
  'packages/remote/test/sse.test.ts',
]

export default [
  {
    name: 'the client ignores a refusal its answer names',
    edits: [
      {
        file: '../../remote/src/json.ts',
        find: 'answer.unauthenticated === undefined',
        replace: 'true',
      },
    ],
    tests,
  },
  {
    name: "a 401 from in front of Remote is the call's own error",
    edits: [
      {
        file: '../../remote/src/json.ts',
        find: "if (response.status === 401) return refusalOf(body, 'unauthenticated', status)",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a 401 whose body has the key is taken at its word',
    edits: [
      {
        file: '../../remote/src/json.ts',
        find: '() => ({ error: status, [kind]: {} })',
        replace:
          "() => (typeof body === 'object' && body !== null && kind in body ? (body as never) : { error: status, [kind]: {} })",
      },
    ],
    tests,
  },
  {
    name: 'answer leaves a handler’s refusal a 500',
    edits: [
      {
        file: '../src/index.ts',
        find: "      Effect.catchTag('Unauthenticated', error => Effect.succeed(unauthenticatedAnswer(error))),\n",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a read’s refusal cannot cross Effect RPC',
    edits: [
      {
        file: '../../remote/src/wire.ts',
        find: 'error: Schema.Union([RemoteReadError, RemoteProtocolError, RemoteUnauthenticated]),',
        replace: 'error: Schema.Union([RemoteReadError, RemoteProtocolError]),',
      },
    ],
    tests,
  },
  {
    name: 'a live open refused is a live error',
    edits: [
      {
        file: '../../remote/src/sse.ts',
        find: 'if (response.status === 401) {',
        replace: 'if (false) {',
      },
    ],
    tests,
  },
  {
    name: 'a refusing error frame is a live error',
    edits: [
      {
        file: '../../remote/src/sse.ts',
        find: 'if (Predicate.isObject(said) && Predicate.isObject(said.unauthenticated)) {',
        replace: 'if (false) {',
      },
    ],
    tests,
  },
  {
    name: "a 401's reason is dropped",
    edits: [
      {
        file: '../src/refusal.ts',
        find: 'unauthenticated: refusal.reason === undefined ? {} : { reason: refusal.reason },',
        replace: 'unauthenticated: {},',
      },
    ],
    tests,
  },
]
