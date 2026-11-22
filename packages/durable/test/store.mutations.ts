/**
 * What the journal says of its store, and the transaction that makes it true,
 * each changed in turn: `pnpm mutate packages/durable/test/store.mutations.ts`.
 */
const journal = '../src/journal.ts'
const edit = (name: string, find: string, replace: string, tests: ReadonlyArray<string>) => ({
  name,
  edits: [{ file: journal, find, replace }],
  tests,
})
const race = ['packages/durable/test/storeRace.test.ts']
const d1 = ['packages/durable/test/d1.test.ts']

export default [
  edit(
    'the SQLite journal is said to be read-committed',
    "  name: 'SQLite journal',\n  isolation: 'serializable',",
    "  name: 'SQLite journal',\n  isolation: 'read-committed',",
    race,
  ),
  edit(
    'the D1 journal is said to be serializable',
    "  name: 'D1 journal',\n  isolation: 'read-committed',",
    "  name: 'D1 journal',\n  isolation: 'serializable',",
    d1,
  ),
  edit(
    'the D1 journal is said to isolate a read and a later write',
    "  isolation: 'read-committed',\n  isolates: 'statement',",
    "  isolation: 'read-committed',\n  isolates: 'transaction',",
    d1,
  ),
  edit(
    'the SQLite journal is said to isolate one statement',
    "  isolation: 'serializable',\n  isolates: 'transaction',",
    "  isolation: 'serializable',\n  isolates: 'statement',",
    race,
  ),
  edit(
    'a journal over D1 says what a journal over SQLite does',
    'store: d1 ? D1_STORE : SQLITE_STORE,',
    'store: SQLITE_STORE,',
    d1,
  ),
  edit(
    'an append over SQLite runs outside a transaction',
    '      : sql.withTransaction(unit)\n  }',
    '      : unit\n  }',
    race,
  ),
]
