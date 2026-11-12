/**
 * Each §14.2 criterion broken in Sync's IndexedDB storage and in the prototypes:
 * `pnpm mutate packages/sync/test/prototype/criteria.mutations.ts`.
 */
const tests = ['packages/sync/test/prototype/criteria.browser.test.ts']

export default [
  {
    name: 'indexedDb: a write skips the revision check',
    edits: [
      {
        file: '../../src/indexedDb.ts',
        find: 'if (revision !== expectedRevision) {',
        replace: 'if (false) {',
      },
    ],
    tests,
  },
  {
    name: 'indexedDb: a save writes no state',
    edits: [
      {
        file: '../../src/indexedDb.ts',
        find: "replica.put(state, 'state')",
        replace: 'void state',
      },
    ],
    tests,
  },
  {
    name: 'indexedDb: a load drops the appended operations',
    edits: [
      {
        file: '../../src/indexedDb.ts',
        find: '...entries.map(entry => entry.operation),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'typed transaction: a write skips the revision check',
    edits: [
      {
        file: './effectStorage.ts',
        find: 'if (revision !== expectedRevision) return yield* conflict()',
        replace: 'if (false) return yield* conflict()',
      },
    ],
    tests,
  },
  {
    name: 'typed transaction: each query of a write is its own transaction',
    edits: [
      {
        file: './effectStorage.ts',
        find: "        query.withTransaction({\n          tables: ['replica', 'outbox'],\n          mode: 'readwrite',",
        replace:
          "        ((_: object) => (effect: Effect.Effect<void, unknown>) => effect)({\n          tables: ['replica', 'outbox'],\n          mode: 'readwrite',",
      },
    ],
    tests,
  },
  {
    name: 'typed transaction: a save writes no state',
    edits: [
      {
        file: './effectStorage.ts',
        find: "query.from('replica').upsert({ key: 'state', value: state }),",
        replace: 'Effect.void,',
      },
    ],
    tests,
  },
  {
    name: 'typed transaction: a load drops the appended operations',
    edits: [
      {
        file: './effectStorage.ts',
        find: '...entries.map(entry => entry.operation),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'KeyValueStore: a write skips the revision check',
    edits: [
      {
        file: './effectStorage.ts',
        find: '(JSON.parse(current) as { revision: number }).revision === expectedRevision',
        replace: 'true',
      },
    ],
    tests,
  },
  {
    name: 'KeyValueStore: a load reads nothing',
    edits: [
      {
        file: './effectStorage.ts',
        find: '(text === undefined ? undefined : (JSON.parse(text) as unknown))',
        replace: 'undefined',
      },
    ],
    tests,
  },
  {
    name: 'the race runs its writers one after the other',
    edits: [
      {
        file: './criteria.browser.test.ts',
        find: "{ concurrency: 'unbounded' }",
        replace: '{ concurrency: 1 }',
      },
    ],
    tests,
  },
]
