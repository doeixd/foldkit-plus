/**
 * `RemoteData.render`'s `Freshness`, broken in turn:
 * `pnpm mutate packages/remote/test/freshnessUnion.mutations.ts`.
 */
const file = '../src/remoteData.ts'
const tests = ['packages/remote/test/remoteData.test.ts']

export default [
  {
    name: 'a value a failed read left behind reads as refreshing',
    edits: [
      {
        file,
        find: 'cases.data(data.previous, Freshness.Stale({ error: data.error }))',
        replace: 'cases.data(data.previous, refreshing)',
      },
    ],
    tests,
  },
  {
    name: 'a value being refetched reads as fresh',
    edits: [
      {
        file,
        find: 'cases.data(data.value, refreshing)',
        replace: 'cases.data(data.value, fresh)',
      },
    ],
    tests,
  },
]
