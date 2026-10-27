/**
 * A page render's in-process reader, broken in turn:
 * `pnpm mutate packages/remote-server/test/pageReader.mutations.ts` checks
 * that a test fails for every one.
 */
const file = '../src/fetch.ts'
const tests = ['packages/remote-server/test/pageReader.test.ts']

export default [
  {
    name: 'the reader writes',
    edits: [
      {
        file,
        find: "          FoldkitRemoteMutate: () =>\n            Effect.fail(\n              new RemoteMutationError({ message: 'A page render reads; it does not write' }),\n            ),\n",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the reader opens a live stream',
    edits: [
      {
        file,
        find: "          FoldkitRemoteLive: () =>\n            Stream.fail(new RemoteLiveError({ message: 'A page render keeps no live stream' })),\n",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the principal ignores the request',
    edits: [
      {
        file,
        find: 'Effect.map(config.resolvePrincipal(request, env), principal => {',
        replace:
          'Effect.map(config.resolvePrincipal(new Request(request.url), env), principal => {',
      },
    ],
    tests,
  },
  {
    name: "the reader drops serveFetch's limits",
    edits: [
      {
        file,
        find: '          maxIdsPerEntity: config.maxIdsPerEntity,\n          maxDepth: config.maxDepth,\n',
        replace: '',
      },
    ],
    tests,
  },
]
