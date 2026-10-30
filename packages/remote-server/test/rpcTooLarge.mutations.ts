/**
 * A request refused over Effect RPC (#360, #366), broken in turn:
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
    edits: [{ file: rpc, find: 'Option.contains(status, 413)', replace: 'false' }],
    tests,
  },
  {
    name: 'every status reads as refused, a gateway’s 502 included',
    edits: [
      {
        file: rpc,
        find: 'Option.contains(status, 413)',
        replace: 'Option.isSome(status)',
      },
    ],
    tests,
  },
  {
    name: 'a 401 reads as unreachable, so a durable write is resent until the session is back',
    edits: [{ file: rpc, find: 'Option.contains(status, 401)', replace: 'false' }],
    tests,
  },
  {
    name: 'a 403 reads as unreachable',
    edits: [{ file: rpc, find: 'Option.contains(status, 403)', replace: 'false' }],
    tests,
  },
  {
    name: 'a mutation under a 403 is its own error, not forbidden',
    edits: [{ file: index, find: 'status === 403', replace: 'false' }],
    tests,
  },
  {
    name: 'a mutation refused reads as unreachable',
    edits: [
      {
        file: index,
        find: ': new RemoteMutationError({ message }),',
        replace: ': new RemoteUnreachable({ message }),',
      },
    ],
    tests,
  },
  {
    name: 'a read refused reads as unreachable',
    edits: [
      {
        file: index,
        find: 'rpcFailure((_status, message) => new RemoteReadError({ message })),',
        replace: 'rpcFailure((_status, message) => new RemoteUnreachable({ message })),',
      },
    ],
    tests,
  },
  {
    name: 'a query refused reads as unreachable',
    edits: [
      {
        file: index,
        find: 'rpcFailure((_status, message) => new RemoteQueryError({ message })),',
        replace: 'rpcFailure((_status, message) => new RemoteUnreachable({ message })),',
      },
    ],
    tests,
  },
]
