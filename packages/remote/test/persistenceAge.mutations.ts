/**
 * Saved reads' ages and eviction order (#404), broken in turn:
 * `pnpm mutate packages/remote/test/persistenceAge.mutations.ts`.
 */
const file = '../src/persistence.ts'
const persist = '../src/persist.ts'
const tests = [
  'packages/remote/test/persistenceAge.test.ts',
  'packages/remote/test/persistenceWiring.test.ts',
  'packages/remote/test/persistenceFirstFrame.test.ts',
  'packages/remote/test/persistence.test.ts',
  'packages/remote/test/retained.test.ts',
]

export default [
  {
    name: 'a row is dated from 0, not from when it was fetched',
    edits: [
      {
        file,
        find: 'const fetched = model.entities[key]!.updatedAt + age',
        replace: 'const fetched = age',
      },
    ],
    tests,
  },
  {
    name: 'dehydrate keeps what has expired',
    edits: [
      {
        file,
        find: 'const live = options.now === undefined ? snapshot : unexpired(snapshot, options.now)',
        replace: 'const live = snapshot',
      },
    ],
    tests,
  },
  {
    name: 'hydrate keeps what has expired',
    edits: [
      {
        file,
        find: 'return Option.some(options.now === undefined ? snapshot : unexpired(snapshot, options.now))',
        replace: 'return Option.some(snapshot)',
      },
    ],
    tests,
  },
  {
    name: 'what expires at this millisecond is kept',
    edits: [
      {
        file,
        find: '(own(expires, key) ?? Infinity) > now',
        replace: '(own(expires, key) ?? Infinity) >= now',
      },
    ],
    tests,
  },
  {
    name: 'save writes without the clock',
    edits: [
      {
        file,
        find: 'const text = dehydrate(snapshot, { ...options, now })',
        replace: 'const text = dehydrate(snapshot, options)',
      },
    ],
    tests,
  },
  {
    name: 'restore reads without the clock',
    edits: [
      {
        file,
        find: 'const restored = hydrate(raw, { ...options, now: yield* Clock.currentTimeMillis })',
        replace: 'const restored = hydrate(raw, options)',
      },
    ],
    tests,
  },
  {
    name: 'the wiring ignores its maxAge',
    edits: [
      {
        file,
        find: 'RemotePersistence.snapshotOf(remote, { connections, maxAge })',
        replace: 'RemotePersistence.snapshotOf(remote, { connections })',
      },
    ],
    tests,
  },
  {
    name: 'persist: false is saved',
    edits: [{ file, find: '    if (persist === false) return\n', replace: '' }],
    tests,
  },
  {
    name: 'a call’s own maxAge is ignored',
    edits: [{ file, find: 'const age = persist ?? maxAge', replace: 'const age = maxAge' }],
    tests,
  },
  {
    name: 'a row a kept list names expires on its own',
    edits: [
      { file, find: 'onSome: list => Math.max(fetched, list),', replace: 'onSome: () => fetched,' },
    ],
    tests,
  },
  {
    name: 'a list not named is saved as a list',
    edits: [
      {
        file,
        find: 'if (held === undefined || !named.has(identity)) return Option.none()',
        replace: 'if (held === undefined) return Option.none()',
      },
    ],
    tests,
  },
  {
    name: 'the batches left are ordered oldest first',
    edits: [
      {
        file,
        find: '...[...model.recent.departed].reverse()]',
        replace: '...model.recent.departed]',
      },
    ],
    tests,
  },
  {
    name: 'what no read reaches is dropped first of all',
    edits: [
      {
        file,
        find: 'recency.push({ rows: [...unread.rows], lists: [...unread.lists] })',
        replace: 'recency.unshift({ rows: [...unread.rows], lists: [...unread.lists] })',
      },
    ],
    tests,
  },
  {
    name: 'an older batch that fits is kept past one that does not',
    edits: [
      {
        file,
        find: 'if (size + cost - commas > maxBytes) break',
        replace: 'if (size + cost - commas > maxBytes) continue',
      },
    ],
    tests,
  },
  {
    name: 'the commas are counted once too often',
    edits: [
      {
        file,
        find: 'if (size + cost - commas > maxBytes) break',
        replace: 'if (size + cost > maxBytes) break',
      },
    ],
    tests,
  },
  {
    name: 'a restored list is dated 0',
    edits: [
      {
        file: '../src/model.ts',
        find: 'receivedAt: own(message.receivedAt, identity) ?? 0,',
        replace: 'receivedAt: 0,',
      },
    ],
    tests,
  },
  {
    name: 'two calls’ ages take the shorter',
    edits: [
      {
        file: persist,
        find: 'return Math.max(said, also)',
        replace: 'return Math.min(said, also)',
      },
    ],
    tests,
  },
  {
    name: 'an age wins over false',
    edits: [
      {
        file: persist,
        find: 'if (said === false || also === false) return false',
        replace: 'if (said === false && also === false) return false',
      },
    ],
    tests,
  },
  {
    name: 'Data.subscriptions drops what its calls say',
    edits: [
      {
        file: '../src/remote.ts',
        find: 'const roots = withPersist(\n            rootsOf(projections, { connections: [...keptConnections] }),\n            said,\n          )',
        replace: 'const roots = rootsOf(projections, { connections: [...keptConnections] })',
      },
    ],
    tests,
  },
  {
    name: 'a retain entry wired by hand drops its persist',
    edits: [
      {
        file: '../src/domain.ts',
        find: '    persistOf(options.persist),\n',
        replace: '    undefined,\n',
      },
    ],
    tests,
  },
  {
    name: 'an empty page leaves its list undated',
    edits: [
      {
        file: '../src/domain.ts',
        find: 'const dated = hasPayload ? (now ?? 0) : now',
        replace: 'const dated = hasPayload ? (now ?? 0) : undefined',
      },
    ],
    tests,
  },
  {
    name: 'the version is not bumped',
    edits: [
      {
        file,
        find: 'export const REMOTE_CACHE_VERSION = 6',
        replace: 'export const REMOTE_CACHE_VERSION = 5',
      },
    ],
    // A version 5 snapshot carries no `expiresAt`, which the parser refuses
    // too: the bump and the shape each refuse it, so neither alone is missed.
    survives: 'the new shape refuses an old snapshot on its own',
    tests,
  },
]
