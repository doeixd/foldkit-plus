/**
 * `persistence(Data, …)`, broken in turn:
 * `pnpm mutate packages/remote/test/persistenceWiring.mutations.ts`.
 */
const tests = [
  'packages/remote/test/persistenceWiring.test.ts',
  'packages/remote/test/persistenceFirstFrame.test.ts',
]
const file = '../src/persistence.ts'
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
    edits: [
      {
        file,
        find: "merge: 'preserve-existing',\n        from: key,",
        replace: "merge: 'preserve-existing',",
      },
    ],
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
        find: "merge: 'preserve-existing',\n        from: key,",
        replace: "merge: 'replace',\n        from: key,",
      },
    ],
    tests,
  },
  {
    name: 'an unreadable store restores an empty cache',
    edits: [
      {
        file,
        find: '      Effect.option,\n    )\n  // Restores the key',
        replace:
          "      Effect.orElseSucceed((): RemoteMessage => ({ _tag: 'Hydrated', entities: {}, connections: {}, merge: 'preserve-existing', from: key })),\n      Effect.option,\n    )\n  // Restores the key",
      },
    ],
    tests,
  },
  {
    name: 'the entry restores a key the Model is already restored from',
    edits: [
      {
        file,
        find: 'restored\n        ? Stream.empty\n        : Stream.fromEffect(hydratedFrom',
        replace: 'false\n        ? Stream.empty\n        : Stream.fromEffect(hydratedFrom',
      },
    ],
    tests,
  },
  {
    name: 'the entry restores nothing once any key is restored',
    edits: [
      {
        file,
        find: 'restored: Option.contains(domain.store.get(model).restoredFrom, key),',
        replace: 'restored: Option.isSome(domain.store.get(model).restoredFrom),',
      },
    ],
    tests,
  },
  {
    name: 'init starts from the Model as it was',
    edits: [
      {
        file,
        find: 'onSome: message => domain.reduce(model, message)',
        replace: 'onSome: () => model',
      },
    ],
    tests,
  },
  {
    name: 'an unreadable store counts as restored in init',
    edits: [
      {
        file,
        find: 'Option.match({ onNone: () => model,',
        replace:
          "Option.match({ onNone: () => domain.reduce(model, { _tag: 'Hydrated', entities: {}, connections: {}, merge: 'preserve-existing', from: options.key(model) }),",
      },
    ],
    tests,
  },
  {
    name: 'forget restores the snapshot it forgot',
    edits: [{ file: model, find: '    restoredFrom: model.restoredFrom,\n', replace: '' }],
    tests,
  },
  {
    name: 'an oversized snapshot leaves the older one stored',
    edits: [{ file, find: 'onNone: () => kv.remove(key),', replace: 'onNone: () => Effect.void,' }],
    tests,
  },
]
