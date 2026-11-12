/**
 * `RemoteData.all`: each pair of precedence ranks swapped in turn (a Ready
 * outranking a Refreshing included), and what a failure keeps.
 * `pnpm mutate packages/remote/test/remoteDataAll.mutations.ts`.
 */
const file = '../src/remoteData.ts'
const tests = ['packages/remote/test/remoteDataAll.test.ts']
const ranked = (ranks: Record<string, number>) =>
  Object.entries(ranks)
    .map(([name, rank]) => `    ${name}: () => ${rank},`)
    .join('\n')
const original = ranked({ Failed: 0, NotFound: 1, Initial: 2, Loading: 3, Refreshing: 4, Ready: 5 })

export default [
  {
    name: 'Failed and NotFound swap precedence',
    edits: [
      {
        file,
        find: original,
        replace: ranked({
          Failed: 1,
          NotFound: 0,
          Initial: 2,
          Loading: 3,
          Refreshing: 4,
          Ready: 5,
        }),
      },
    ],
    tests,
  },
  {
    name: 'Failed and Initial swap precedence',
    edits: [
      {
        file,
        find: original,
        replace: ranked({
          Failed: 2,
          NotFound: 1,
          Initial: 0,
          Loading: 3,
          Refreshing: 4,
          Ready: 5,
        }),
      },
    ],
    tests,
  },
  {
    name: 'Failed and Loading swap precedence',
    edits: [
      {
        file,
        find: original,
        replace: ranked({
          Failed: 3,
          NotFound: 1,
          Initial: 2,
          Loading: 0,
          Refreshing: 4,
          Ready: 5,
        }),
      },
    ],
    tests,
  },
  {
    name: 'Failed and Refreshing swap precedence',
    edits: [
      {
        file,
        find: original,
        replace: ranked({
          Failed: 4,
          NotFound: 1,
          Initial: 2,
          Loading: 3,
          Refreshing: 0,
          Ready: 5,
        }),
      },
    ],
    tests,
  },
  {
    name: 'Failed and Ready swap precedence',
    edits: [
      {
        file,
        find: original,
        replace: ranked({
          Failed: 5,
          NotFound: 1,
          Initial: 2,
          Loading: 3,
          Refreshing: 4,
          Ready: 0,
        }),
      },
    ],
    tests,
  },
  {
    name: 'NotFound and Initial swap precedence',
    edits: [
      {
        file,
        find: original,
        replace: ranked({
          Failed: 0,
          NotFound: 2,
          Initial: 1,
          Loading: 3,
          Refreshing: 4,
          Ready: 5,
        }),
      },
    ],
    tests,
  },
  {
    name: 'NotFound and Loading swap precedence',
    edits: [
      {
        file,
        find: original,
        replace: ranked({
          Failed: 0,
          NotFound: 3,
          Initial: 2,
          Loading: 1,
          Refreshing: 4,
          Ready: 5,
        }),
      },
    ],
    tests,
  },
  {
    name: 'NotFound and Refreshing swap precedence',
    edits: [
      {
        file,
        find: original,
        replace: ranked({
          Failed: 0,
          NotFound: 4,
          Initial: 2,
          Loading: 3,
          Refreshing: 1,
          Ready: 5,
        }),
      },
    ],
    tests,
  },
  {
    name: 'NotFound and Ready swap precedence',
    edits: [
      {
        file,
        find: original,
        replace: ranked({
          Failed: 0,
          NotFound: 5,
          Initial: 2,
          Loading: 3,
          Refreshing: 4,
          Ready: 1,
        }),
      },
    ],
    tests,
  },
  {
    name: 'Initial and Loading swap precedence',
    edits: [
      {
        file,
        find: original,
        replace: ranked({
          Failed: 0,
          NotFound: 1,
          Initial: 3,
          Loading: 2,
          Refreshing: 4,
          Ready: 5,
        }),
      },
    ],
    tests,
  },
  {
    name: 'Initial and Refreshing swap precedence',
    edits: [
      {
        file,
        find: original,
        replace: ranked({
          Failed: 0,
          NotFound: 1,
          Initial: 4,
          Loading: 3,
          Refreshing: 2,
          Ready: 5,
        }),
      },
    ],
    tests,
  },
  {
    name: 'Initial and Ready swap precedence',
    edits: [
      {
        file,
        find: original,
        replace: ranked({
          Failed: 0,
          NotFound: 1,
          Initial: 5,
          Loading: 3,
          Refreshing: 4,
          Ready: 2,
        }),
      },
    ],
    tests,
  },
  {
    name: 'Loading and Refreshing swap precedence',
    edits: [
      {
        file,
        find: original,
        replace: ranked({
          Failed: 0,
          NotFound: 1,
          Initial: 2,
          Loading: 4,
          Refreshing: 3,
          Ready: 5,
        }),
      },
    ],
    tests,
  },
  {
    name: 'Loading and Ready swap precedence',
    edits: [
      {
        file,
        find: original,
        replace: ranked({
          Failed: 0,
          NotFound: 1,
          Initial: 2,
          Loading: 5,
          Refreshing: 4,
          Ready: 3,
        }),
      },
    ],
    tests,
  },
  {
    name: 'Refreshing and Ready swap precedence',
    edits: [
      {
        file,
        find: original,
        replace: ranked({
          Failed: 0,
          NotFound: 1,
          Initial: 2,
          Loading: 3,
          Refreshing: 5,
          Ready: 4,
        }),
      },
    ],
    tests,
  },
  {
    name: 'a failure keeps no values',
    edits: [
      {
        file,
        find: "onSome: previous => ({ _tag: 'Failed', error, previous }),",
        replace: "onSome: () => ({ _tag: 'Failed', error }),",
      },
    ],
    tests,
  },
  {
    name: 'a failure keeps values although an entry holds none',
    edits: [
      {
        file,
        find: 'held.every(([, value]) => Option.isSome(value))',
        replace: 'held.some(([, value]) => Option.isSome(value))',
      },
    ],
    tests,
  },
]
