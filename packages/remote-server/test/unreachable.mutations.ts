/**
 * A write nothing answered, told apart from one the server failed:
 * `pnpm mutate packages/remote-server/test/unreachable.mutations.ts`.
 */
export default [
  {
    name: 'a JSON write that was never answered reads as refused',
    edits: [
      {
        file: '../../remote/src/json.ts',
        find: 'message => new RemoteUnreachable({ message }),',
        replace: 'message => new RemoteMutationError({ message }),',
      },
    ],
    tests: ['packages/remote-server/test/answer.test.ts'],
  },
  {
    name: 'an RPC write the transport lost reads as refused',
    edits: [
      {
        file: '../../remote/src/index.ts',
        find: 'Effect.fail(new RemoteUnreachable({ message: error.message })),',
        replace: 'Effect.fail(new RemoteMutationError({ message: error.message })),',
      },
    ],
    tests: ['packages/remote/test/rpcClient.test.ts'],
  },
]
