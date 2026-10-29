/**
 * `RemotePersistence.hydrate`'s answer as an `Option`, broken in turn:
 * `pnpm mutate packages/remote/test/hydrateOption.mutations.ts`.
 */
const file = '../src/persistence.ts'
const tests = [
  'packages/remote/test/persistence.test.ts',
  'packages/remote/test/unavailable.test.ts',
  'packages/remote/test/retained.test.ts',
]

export default [
  {
    name: 'a text that reads is refused',
    edits: [
      {
        file,
        find: 'return Option.some(deserializeStore(candidate as SerializedStore))',
        replace: 'return Option.none()',
      },
    ],
    tests,
  },
  {
    name: 'a snapshot for another scope is taken',
    edits: [
      {
        file,
        find: 'if ((candidate.scope ?? null) !== (options.scope ?? null)) return Option.none()',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a refused snapshot is restored, and its key kept',
    edits: [{ file, find: 'if (Option.isNone(restored)) {', replace: 'if (false) {' }],
    tests,
  },
]
