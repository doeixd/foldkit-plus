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
    edits: [
      {
        file: app,
        find: 'RemotePersistence.hydrate(raw, { scope: model.actor })',
        replace: "RemotePersistence.hydrate(raw, { scope: 'ada' })",
      },
    ],
    tests,
  },
  {
    name: 'a refused snapshot is kept',
    edits: [
      {
        file: app,
        find: 'if (raw !== null && next === model)',
        replace: 'if (false)',
      },
    ],
    tests,
  },
]
