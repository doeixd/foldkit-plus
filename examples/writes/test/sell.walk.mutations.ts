/**
 * The walk of `Sell` and `Restock` through the example's server, broken in
 * turn: `pnpm mutate examples/writes/test/sell.walk.mutations.ts`.
 */
const tests = ['examples/writes/test/sell.walk.test.ts']

export default [
  {
    name: "the writer's invariants dropped: only a write's own postcondition is judged",
    edits: [
      {
        file: '../../../packages/remote-drizzle/src/index.ts',
        find: 'ensures === undefined ? invariants : [...invariants, ensures]',
        replace: 'ensures === undefined ? [] : [ensures]',
      },
    ],
    tests,
  },
  {
    name: 'a sale judged against no postcondition: becomes:InStock dropped',
    edits: [
      {
        file: '../../../packages/remote-drizzle/src/index.ts',
        find: 'ensures === undefined ? invariants : [...invariants, ensures]',
        replace: 'invariants',
      },
    ],
    tests,
  },
  {
    name: "a Walked record names the case's tag, not its transition",
    edits: [
      {
        file: '../../../packages/remote/src/walk.ts',
        find: 'transition: transition(tag),',
        replace: 'transition: tag,',
      },
    ],
    tests,
  },
]
