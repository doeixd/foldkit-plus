/**
 * `editsJournal`'s guards, each broken in turn: `pnpm mutate
 * packages/sync/test/editsJournal.mutations.ts` checks that a test fails for every one.
 */
const tests = ['packages/sync/test/editsJournal.test.ts']
const file = '../src/journal.ts'

export default [
  {
    name: 'recovery starts at the beginning, not the floor',
    edits: [
      {
        file,
        find: 'onNone: () => Effect.map(journal.floor(key), floor => Cursor.make(floor)),',
        replace: 'onNone: () => Effect.succeed(Cursor.make(0)),',
      },
    ],
    tests,
  },
  {
    name: 'an intent is keyed without the epoch',
    edits: [
      {
        file,
        find: 'key: `${epoch}:${operation.opId}:${index}`,',
        replace: 'key: `${operation.opId}:${index}`,',
      },
    ],
    tests,
  },
]
