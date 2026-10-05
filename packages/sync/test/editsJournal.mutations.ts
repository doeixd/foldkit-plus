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
        find: '    return Cursor.make(yield* journal.floor(key))',
        replace: '    return Cursor.make(0)',
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
  {
    name: 'a table ahead of its journal is settled anyway',
    edits: [
      {
        file,
        find: '    if (table > at) return yield* new TableAheadOfJournalError({ table, journal: at })\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a table level with its journal is refused',
    edits: [{ file, find: '    if (table > at) return', replace: '    if (table >= at) return' }],
    tests,
  },
]
