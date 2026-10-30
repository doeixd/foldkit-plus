/**
 * A request refused for its size over Effect RPC (#360), broken in turn:
 * `pnpm mutate packages/remote-server/test/rpcTooLarge.mutations.ts`.
 */
const rpc = '../../remote/src/rpc.ts'
const index = '../../remote/src/index.ts'
const tests = ['packages/remote-server/test/rpcTooLarge.test.ts']

export default [
  {
    name: 'the protocol reads a 413 as RPC frames, so its status never reaches the client',
    edits: [
      {
        file: rpc,
        find: 'HttpClient.filterStatusOk(HttpClient.mapRequest(client, HttpClientRequest.prependUrl(url))),',
        replace: 'HttpClient.mapRequest(client, HttpClientRequest.prependUrl(url)),',
      },
    ],
    tests,
  },
  {
    name: 'a 413 reads as unreachable, so a durable write is resent for good',
    edits: [{ file: rpc, find: 'Option.contains(statusOf(error), 413)', replace: 'false' }],
    tests,
  },
  {
    name: 'every status reads as refused, a gateway’s 502 included',
    edits: [
      {
        file: rpc,
        find: 'Option.contains(statusOf(error), 413)',
        replace: 'Option.isSome(statusOf(error))',
      },
    ],
    tests,
  },
  {
    name: 'a mutation refused for its size reads as unreachable',
    edits: [
      {
        file: index,
        find: 'rpcFailure(message => new RemoteMutationError({ message })),',
        replace: 'rpcFailure(message => new RemoteUnreachable({ message })),',
      },
    ],
    tests,
  },
  {
    name: 'a read refused for its size reads as unreachable',
    edits: [
      {
        file: index,
        find: 'rpcFailure(message => new RemoteReadError({ message })),',
        replace: 'rpcFailure(message => new RemoteUnreachable({ message })),',
      },
    ],
    tests,
  },
  {
    name: 'a query refused for its size reads as unreachable',
    edits: [
      {
        file: index,
        find: 'rpcFailure(message => new RemoteQueryError({ message })),',
        replace: 'rpcFailure(message => new RemoteUnreachable({ message })),',
      },
    ],
    tests,
  },
]
