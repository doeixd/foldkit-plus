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
    "? { name: 'SQLite', isolation: 'serializable', isolates: 'statement', parentRowLock: false }",
    "? { name: 'SQLite', isolation: 'read-committed', isolates: 'statement', parentRowLock: false }",
  ),
  edit(
    'SQLite, D1 among it, is said to isolate a read and a later write',
    "? { name: 'SQLite', isolation: 'serializable', isolates: 'statement', parentRowLock: false }",
    "? { name: 'SQLite', isolation: 'serializable', isolates: 'transaction', parentRowLock: false }",
  ),
  edit(
    'the writer does not say it judges its rules in the statement',
    '    judgesInStatement: true,\n    operators: binding.operators.memory,',
    '    operators: binding.operators.memory,',
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
    "isolates: 'transaction',\n        parentRowLock: false,",
    "isolates: 'transaction',\n        parentRowLock: true,",
  ),
  {
    name: 'the statement that writes a row ignores the revision it was sent from',
    edits: [
      {
        file: drizzle,
        find: 'where: and(eq(idColumn(binding), id), eq(column, revision), ...holding),',
        replace: 'where: and(eq(idColumn(binding), id), ...holding),',
      },
    ],
    tests: ['packages/remote-drizzle/test/storeRace.test.ts'],
  },
  {
    name: 'an update holds its row to no rule over other rows in its statement',
    edits: [
      {
        file: drizzle,
        find: '          at.where,\n          ...required,\n          ...targets.map(({ exists }) => exists),\n          ...(yield* holdingInvariants(',
        replace:
          '          at.where,\n          ...targets.map(({ exists }) => exists),\n          ...(yield* holdingInvariants(',
      },
    ],
    tests: ['packages/remote-drizzle/test/parentRace.test.ts'],
  },
  edit(
    'a guarded writer says a weaker store than its writer does',
    '      store: writer.store,\n',
    "      store: { name: 'guard', isolation: 'eventual', parentRowLock: false },\n",
    guard,
  ),
]
