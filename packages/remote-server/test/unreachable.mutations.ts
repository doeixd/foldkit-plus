/**
 * A write nothing answered, or answered with no Remote answer, told apart
 * from one the server failed:
 * `pnpm mutate packages/remote-server/test/unreachable.mutations.ts`.
 */
export default [
  {
    name: 'a JSON call that was never answered reads as refused',
    edits: [
      {
        file: '../../remote/src/json.ts',
        find: 'const unreached = (message: string) => new RemoteUnreachable({ message })',
        replace: 'const unreached = (message: string) => new RemoteMutationError({ message })',
      },
    ],
    tests: ['packages/remote-server/test/answer.test.ts'],
  },
  {
    name: 'an RPC call the transport lost reads as refused',
    edits: [
      {
        file: '../../remote/src/rpc.ts',
        find: 'return Effect.fail(new RemoteUnreachable({ message: error.message }))',
        replace: 'return Effect.fail(refused(413, error.message))',
      },
    ],
    tests: ['packages/remote/test/rpcClient.test.ts'],
  },
  {
    name: 'a JSON write answered with something that is not an answer reads as refused',
    edits: [
      {
        file: '../../remote/src/json.ts',
        find: "unreached('The server answered with something that is not an answer'),",
        replace: "fail({ error: 'The server answered with something that is not an answer' }),",
      },
    ],
    tests: [
      'packages/remote-server/test/answer.test.ts',
      'packages/remote-drizzle/test/outboxLostAnswer.test.ts',
    ],
  },
  {
    name: "a gateway's JSON error page reads as the server's answer",
    edits: [
      {
        file: '../../remote/src/json.ts',
        find: 'if (body === notJson || unanswered.has(response.status))',
        replace: 'if (body === notJson)',
      },
    ],
    tests: ['packages/remote-server/test/answer.test.ts'],
  },
  {
    name: 'a limiter or a timeout reads as the server refusing',
    edits: [
      {
        file: '../../remote/src/json.ts',
        find: 'new Set([408, 429, 502, 503, 504])',
        replace: 'new Set([502, 503, 504])',
      },
    ],
    tests: ['packages/remote-server/test/answer.test.ts'],
  },
]
