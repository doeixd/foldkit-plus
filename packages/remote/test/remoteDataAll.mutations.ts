/**
 * `RemoteData.all`: each pair of precedence ranks swapped in turn (a Ready
 * outranking a Refreshing included), and what a failure keeps.
 * `pnpm mutate packages/remote/test/remoteDataAll.mutations.ts`.
 */
const file = '../src/remoteData.ts'
const tests = ['packages/remote/test/remoteDataAll.test.ts']

const order = ['Failed', 'NotFound', 'Initial', 'Loading', 'Refreshing', 'Ready']
const ranked = (rank: (name: string) => number) =>
  order.map(name => `    ${name}: () => ${rank(name)},`).join('\n')
const original = ranked(name => order.indexOf(name))

const swaps = order.flatMap((first, index) =>
  order.slice(index + 1).map(second => ({
    name: `${first} and ${second} swap precedence`,
    edits: [
      {
        file,
        find: original,
        replace: ranked(name =>
          order.indexOf(name === first ? second : name === second ? first : name),
        ),
      },
    ],
    tests,
  })),
)

export default [
  ...swaps,
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
