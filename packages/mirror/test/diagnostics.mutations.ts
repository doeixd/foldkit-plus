/**
 * A key-value mirror's reports, broken in turn:
 * `pnpm mutate packages/mirror/test/diagnostics.mutations.ts`.
 */
const tests = ['packages/mirror/test/kv.test.ts']
const store = '../src/index.ts'
const diagnostics = '../src/diagnostics.ts'

export default [
  {
    name: 'a failed read is not reported',
    edits: [
      {
        file: store,
        find: '        yield* Diagnostics.report(storeUnread(options.key, raw.failure))',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a failed write is not reported',
    edits: [
      {
        file: store,
        find: '          yield* Diagnostics.report(storeUnwritten(options.key, outcome.failure))',
        replace: '          yield* Effect.void',
      },
    ],
    tests,
  },
  {
    name: 'a failed removal of a discarded document is not reported',
    edits: [
      {
        file: store,
        find: '          yield* Diagnostics.report(storeUnwritten(options.key, removed.failure))',
        replace: '          yield* Effect.void',
      },
    ],
    tests,
  },
  {
    name: 'a malformed document is not reported',
    edits: [
      {
        file: store,
        find: '        yield* Diagnostics.report(storeMalformed(options.key, document.failure.message))',
        replace: '        yield* Effect.void',
      },
    ],
    tests,
  },
  {
    name: 'another scope or version is reported as malformed',
    edits: [
      {
        file: store,
        find: '      if (Result.isFailure(document))\n        yield* Diagnostics.report(storeMalformed(options.key, document.failure.message))',
        replace:
          "      if (Result.isFailure(document) || document.success.scope !== options.scope)\n        yield* Diagnostics.report(storeMalformed(options.key, 'mutated'))",
      },
    ],
    tests,
  },
  {
    name: 'a failed read is reported as an error',
    edits: [
      {
        file: diagnostics,
        find: "  _tag: 'StoreUnread',\n  source,\n  level: 'warning',",
        replace: "  _tag: 'StoreUnread',\n  source,\n  level: 'error',",
      },
    ],
    tests,
  },
]
