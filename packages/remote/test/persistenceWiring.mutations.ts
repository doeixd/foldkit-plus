/**
 * `Data.persistence`, broken in turn:
 * `pnpm mutate packages/remote/test/persistenceWiring.mutations.ts`.
 */
const tests = ['packages/remote/test/persistenceWiring.test.ts']
const file = '../src/index.ts'
const model = '../src/model.ts'

export default [
  {
    name: 'a save runs before its key’s snapshot is in',
    edits: [
      {
        file,
        find: 'const restored = Option.contains(remote.restoredFrom, key)',
        replace: 'const restored = true',
      },
    ],
    tests,
  },
  {
    name: 'a save runs once any snapshot is in',
    edits: [
      {
        file,
        find: 'const restored = Option.contains(remote.restoredFrom, key)',
        replace: 'const restored = Option.isSome(remote.restoredFrom)',
      },
    ],
    tests,
  },
  {
    name: 'a restore does not say which key it came from',
    edits: [{ file, find: '                    from: key,\n', replace: '' }],
    tests,
  },
  {
    name: 'the reducer does not record where a restore came from',
    edits: [
      {
        file: model,
        find: 'message.from === undefined ? model.restoredFrom : Option.some(message.from)',
        replace: 'model.restoredFrom',
      },
    ],
    tests,
  },
  {
    name: 'a snapshot replaces what the store already holds',
    edits: [
      {
        file,
        find: "merge: 'preserve-existing',\n                    from: key,",
        replace: "merge: 'replace',\n                    from: key,",
      },
    ],
    tests,
  },
  {
    name: 'an unreadable store restores an empty cache',
    edits: [
      {
        file,
        find: 'onNone: (): Stream.Stream<RemoteMessage> => Stream.empty,',
        replace:
          "onNone: (): Stream.Stream<RemoteMessage> => Stream.make({ _tag: 'Hydrated', entities: [], connections: [], merge: 'preserve-existing', from: key }),",
      },
    ],
    tests,
  },
  {
    name: 'an oversized snapshot leaves the older one stored',
    edits: [{ file, find: 'onNone: () => kv.remove(key),', replace: 'onNone: () => Effect.void,' }],
    tests,
  },
]
