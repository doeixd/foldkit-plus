/**
 * What a snapshot keeps, broken one filter at a time:
 * `pnpm mutate examples/cloudflare/test/cache.mutations.ts`
 */
const cache = '../src/cache.ts'
const app = '../src/app.ts'
const tests = ['examples/cloudflare/test/cache.test.ts']

export default [
  {
    name: 'a pending edge is stored',
    edits: [
      {
        file: cache,
        find: 'return entry !== undefined && entry.tombstone === false',
        replace: 'return true',
      },
    ],
    tests,
  },
  {
    name: 'confirmed edges stay overlays',
    edits: [
      {
        file: cache,
        find: 'connections: { [identity]: [edges] }',
        replace: 'connections: base.connections',
      },
    ],
    tests,
  },
  {
    name: 'an empty page has no segment',
    edits: [
      {
        file: cache,
        find: 'connections: { [identity]: [edges] }',
        replace: 'connections: { [identity]: [] }',
      },
    ],
    tests,
  },
  {
    name: 'the watch row is stored',
    edits: [
      {
        file: cache,
        find: 'if (!Object.hasOwn(snapshot.entities, WATCH_KEY)) return snapshot',
        replace: 'return snapshot',
      },
    ],
    tests,
  },
  {
    name: 'a watch edge is stored',
    edits: [
      {
        file: cache,
        find: 'edge => edge.ref.id !== LIST_WATCH && inStore(remote, edge)',
        replace: 'edge => inStore(remote, edge)',
      },
    ],
    tests,
  },
  {
    name: 'any actor reads the snapshot',
    edits: [{ file: app, find: 'scope: model => model.actor,', replace: "scope: () => 'ada'," }],
    tests,
  },
  {
    name: 'every actor reads one key',
    edits: [
      {
        file: app,
        find: 'key: model => cacheKey(model.actor),',
        replace: "key: () => cacheKey('ada'),",
      },
    ],
    tests,
  },
  {
    name: 'the snapshot keeps the connection’s own segments',
    edits: [{ file: app, find: 'snapshot: snapshotFor,', replace: '' }],
    tests,
  },
]
