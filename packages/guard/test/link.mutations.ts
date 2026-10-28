/**
 * A guard rule over a link, broken in turn:
 * `pnpm mutate packages/guard/test/link.mutations.ts`.
 */
export default [
  {
    name: 'a rule compares a link as its ref key',
    edits: [
      {
        file: '../src/condition.ts',
        find: '[Held.fromRefs(guard.query, values)]',
        replace: '[values]',
      },
    ],
    tests: ['packages/guard/test/link.test.ts'],
  },
]
