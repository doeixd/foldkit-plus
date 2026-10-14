/**
 * `RemoteData.denied`, broken in turn: `pnpm mutate packages/remote/test/denied.mutations.ts`.
 */
const file = '../src/remoteData.ts'
const tests = ['packages/remote/test/remoteData.test.ts']

export default [
  {
    name: 'a 403 is not a denial',
    edits: [{ file, find: "['Unauthenticated', 'Forbidden']", replace: "['Unauthenticated']" }],
    tests,
  },
  {
    name: 'any failure is a denial',
    edits: [{ file, find: 'denials.has(tag)', replace: 'true' }],
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
  {
    name: 'a 401 is read as a 403',
    edits: [
      {
        file,
        find: 'Unauthenticated: Denied.Unauthenticated, Forbidden',
        replace: 'Unauthenticated: Denied.Forbidden, Forbidden',
      },
    ],
    tests,
  },
]
