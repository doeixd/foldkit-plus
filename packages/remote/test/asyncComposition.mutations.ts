/**
 * `RemoteData.map`, which a `pipe` of transformations is built from, broken in
 * turn: `pnpm mutate packages/remote/test/asyncComposition.mutations.ts`.
 */
const file = '../src/remoteData.ts'
const tests = ['packages/remote/test/asyncComposition.test.ts']

export default [
  {
    name: 'a failed refetch loses the value it held',
    edits: [
      {
        file,
        find: ": { _tag: 'Failed', error: data.error, previous: f(data.previous) }",
        replace: ": { _tag: 'Failed', error: data.error }",
      },
    ],
    tests,
  },
  {
    name: 'a value being refetched reads as settled',
    edits: [
      {
        file,
        find: "return { _tag: 'Refreshing', value: f(data.value) }",
        replace: "return { _tag: 'Ready', value: f(data.value) }",
      },
    ],
    tests,
  },
  {
    name: 'a failure with nothing held loses its error',
    edits: [
      {
        file,
        find: "? { _tag: 'Failed', error: data.error }",
        replace: "? { _tag: 'Failed', error: { ...data.error, message: '' } }",
      },
    ],
    tests,
  },
  {
    name: 'an absent row reads as loading',
    edits: [
      {
        file,
        find: "      case 'Loading':\n      case 'NotFound':\n        return data",
        replace:
          "      case 'Loading':\n        return data\n      case 'NotFound':\n        return { _tag: 'Loading' }",
      },
    ],
    tests,
  },
]
