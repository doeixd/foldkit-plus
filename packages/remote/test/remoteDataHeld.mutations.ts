/**
 * The states `RemoteData.held` reads a value from, each dropped in turn:
 * `pnpm mutate packages/remote/test/remoteDataHeld.mutations.ts`.
 */
const file = '../src/remoteData.ts'
const tests = ['packages/remote/test/remoteData.test.ts']
const drop = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  drop('a Ready read holds nothing', 'Ready: Option.some,', 'Ready: () => Option.none(),'),
  drop(
    'a Refreshing read holds nothing',
    'Refreshing: Option.some,',
    'Refreshing: () => Option.none(),',
  ),
  drop(
    'a failed refresh keeps nothing',
    'Failed: (_, previous) => previous,',
    'Failed: () => Option.none(),',
  ),
]
