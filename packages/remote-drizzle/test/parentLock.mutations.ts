export default [
  {
    name: 'sortParentIds fails to sort ascending',
    edits: [
      {
        file: '../src/parentLock.ts',
        find: '  [...new Set(ids)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))',
        replace: '  [...new Set(ids)]',
      },
    ],
    tests: ['packages/remote-drizzle/test/parentLock.test.ts'],
  },
  {
    name: 'storeOf ignores parentRowLock flag on Postgres',
    edits: [
      {
        file: '../src/index.ts',
        find: "        isolates: 'transaction',\n        parentRowLock,",
        replace: "        isolates: 'transaction',\n        parentRowLock: false,",
      },
    ],
    tests: ['packages/remote-drizzle/test/parentLock.test.ts'],
  },
]
