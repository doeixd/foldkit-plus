/**
 * What the Drizzle writer says of its store, each claim changed in turn:
 * `pnpm mutate packages/remote-drizzle/test/store.mutations.ts`.
 */
const drizzle = '../src/index.ts'
const guard = '../../guard/src/server.ts'
const tests = ['packages/remote-drizzle/test/store.test.ts', 'packages/guard/test/pinned.test.ts']
const edit = (name: string, find: string, replace: string, file = drizzle) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'SQLite is said to be read-committed',
    "? { name: 'SQLite', isolation: 'serializable', parentRowLock: false }",
    "? { name: 'SQLite', isolation: 'read-committed', parentRowLock: false }",
  ),
  edit(
    'Postgres is said to run serializable as it comes',
    "isolation: serializable ? 'serializable' : 'read-committed',",
    "isolation: 'serializable',",
  ),
  edit(
    'Postgres said to run serializable is still read-committed',
    "store: storeOf(binding.table, options.isolation === 'serializable'),",
    'store: storeOf(binding.table, false),',
  ),
  edit(
    'Postgres is said to lock the parent row',
    "isolation: serializable ? 'serializable' : 'read-committed',\n        parentRowLock: false,",
    "isolation: serializable ? 'serializable' : 'read-committed',\n        parentRowLock: true,",
  ),
  edit(
    'a guarded writer drops what its writer says of its store',
    '      ...(writer.store === undefined ? {} : { store: writer.store }),\n',
    '',
    guard,
  ),
]
