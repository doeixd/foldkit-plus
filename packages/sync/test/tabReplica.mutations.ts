/**
 * A replica named by its store, and a tab's store, broken in turn: `pnpm mutate
 * packages/sync/test/tabReplica.mutations.ts` checks that a test fails for every one.
 */
const tests = ['packages/sync/test/tabReplica.test.ts']

export default [
  {
    name: 'every store mints the same id',
    edits: [
      {
        file: '../src/sync.ts',
        find: 'ReplicaId.make(crypto.randomUUID())',
        replace: "ReplicaId.make('replica')",
      },
    ],
    tests,
  },
  {
    name: 'a reopened store mints a new id instead of reading its own',
    edits: [
      {
        file: '../src/sync.ts',
        find: '      const replicaId = state.replicaId\n',
        replace: '      const replicaId = initial.replicaId\n',
      },
    ],
    tests,
  },
  {
    name: 'an explicit id over another store is accepted',
    edits: [
      {
        file: '../src/sync.ts',
        find: '(options?.replicaId !== undefined && replicaId !== options.replicaId)',
        replace: 'false',
      },
    ],
    tests,
  },
  {
    name: 'a tab never reuses its kept key',
    edits: [
      {
        file: '../src/indexedDb.ts',
        find: 'kept !== null && (yield* held(kept)) ? kept',
        replace: 'false ? kept',
      },
    ],
    tests,
  },
  {
    name: 'a duplicated tab reuses a key another tab holds',
    edits: [
      {
        file: '../src/indexedDb.ts',
        find: '.pipe(Effect.map(Option.isSome))',
        replace: '.pipe(Effect.as(true))',
      },
    ],
    tests,
  },
  {
    name: 'a lock is never released',
    edits: [
      {
        file: '../src/indexedDb.ts',
        find: 'held => Effect.sync(() => Option.map(held, release => release())),',
        replace: '() => Effect.void,',
      },
    ],
    tests,
  },
  {
    name: 'a minted key is not kept for the next load',
    edits: [{ file: '../src/indexedDb.ts', find: '    session.setItem(name, key)\n', replace: '' }],
    tests,
  },
  {
    name: 'one key is shared by every name',
    edits: [
      {
        file: '../src/indexedDb.ts',
        find: 'session.getItem(name)',
        replace: "session.getItem('tab')",
      },
      {
        file: '../src/indexedDb.ts',
        find: 'session.setItem(name, key)',
        replace: "session.setItem('tab', key)",
      },
    ],
    tests,
  },
]
