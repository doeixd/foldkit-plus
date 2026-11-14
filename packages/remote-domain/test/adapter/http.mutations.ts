/**
 * The retry after a lost reply, broken in turn:
 * `pnpm mutate packages/remote-domain/test/adapter/http.mutations.ts`.
 */
const tests = ['packages/remote-domain/test/adapter/http.test.ts']

export default [
  {
    name: 'a retry is sent under a new command id',
    edits: [
      {
        file: '../../src/adapter/layer.ts',
        find: 'request.keys ?? null, encoded])',
        replace: 'request.keys ?? null, encoded, Math.random()])',
      },
    ],
    tests,
  },
  {
    name: 'a lost reply is not read as the Api being unreachable',
    edits: [
      {
        file: '../../src/adapter/layer.ts',
        find: 'if (Schema.is(RpcClientError)(error))',
        replace: 'if (false)',
      },
    ],
    tests,
  },
]
