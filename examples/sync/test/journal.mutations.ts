/**
 * The sync example's journal, broken in turn:
 * `pnpm mutate examples/sync/test/journal.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = ['examples/sync/test/sync.test.ts']

export default [
  {
    name: 'a failed effect is never tried again',
    edits: [
      {
        file: '../src/journal.ts',
        find: 'intents: operation => intentsOf(operation, documentId),',
        replace:
          "intents: operation => intentsOf(operation, documentId), onUnresolved: () => 'skip',",
      },
    ],
    tests,
  },
  {
    name: 'an exchange settles nothing',
    edits: [
      {
        file: '../src/journal.ts',
        find: 'settle: settleThrough(principal.documentId),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a reader may write',
    edits: [
      {
        file: '../src/journal.ts',
        find: 'admit: () => principal.canWrite,',
        replace: '',
      },
    ],
    tests,
  },
]
