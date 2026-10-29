/**
 * `RemoteData.isUnreachable`, broken in turn:
 * `pnpm mutate packages/remote/test/isUnreachable.mutations.ts`.
 */
const file = '../src/remoteData.ts'
const tests = [
  'packages/remote/test/remoteData.test.ts',
  'examples/reference/test/notebook.test.ts',
]

export default [
  {
    name: 'nothing is ever unreachable',
    edits: [{ file, find: 'error._tag === unreachable,', replace: 'false,' }],
    tests,
  },
  {
    name: 'every failure is unreachable',
    edits: [{ file, find: 'error._tag === unreachable,', replace: 'true,' }],
    tests,
  },
]
