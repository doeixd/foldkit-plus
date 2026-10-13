/**
 * `RemoteData.refused`, broken in turn: `pnpm mutate packages/remote/test/refused.mutations.ts`.
 */
const file = '../src/remoteData.ts'
const tests = ['packages/remote/test/remoteData.test.ts']

export default [
  {
    name: 'a 403 is not a refusal',
    edits: [{ file, find: "['Unauthenticated', 'Forbidden']", replace: "['Unauthenticated']" }],
    tests,
  },
  {
    name: 'any failure is a refusal',
    edits: [{ file, find: 'refusals.has(tag)', replace: 'true' }],
    tests,
  },
  {
    name: "the server's reason is dropped",
    edits: [
      {
        file,
        find: 'reason: Option.fromUndefinedOr(error.reason)',
        replace: 'reason: Option.none()',
      },
    ],
    tests,
  },
]
