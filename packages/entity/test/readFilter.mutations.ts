/**
 * `ReadFilter`'s merge, broken: `pnpm mutate packages/entity/test/readFilter.mutations.ts`.
 */
export default [
  {
    name: 'a later annotation replaces an earlier one',
    edits: [
      {
        file: '../src/readFilter.ts',
        find: 'merge: lists => [[...new Set(lists.flat())]],',
        replace: 'merge: lists => lists.slice(-1),',
      },
    ],
    tests: ['packages/entity/test/readFilter.test.ts'],
  },
  {
    name: 'a member named twice is kept twice',
    edits: [
      {
        file: '../src/readFilter.ts',
        find: 'merge: lists => [[...new Set(lists.flat())]],',
        replace: 'merge: lists => [lists.flat()],',
      },
    ],
    tests: ['packages/entity/test/readFilter.test.ts'],
  },
]
