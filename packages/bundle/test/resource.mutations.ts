/**
 * `Resource.lazy`, broken in turn:
 * `pnpm mutate packages/bundle/test/resource.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = ['packages/bundle/test/resource.test.ts']
const file = '../src/resource.ts'

export default [
  {
    name: 'two Commands asking at once each import',
    edits: [{ file, find: '            loading = Option.some(deferred)\n', replace: '' }],
    tests,
  },
  {
    name: 'a failed import is kept, so no Command tries again',
    edits: [
      {
        file,
        find: '                  loading = Option.none()\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the load runs in the asking Command',
    edits: [{ file, find: '              Effect.forkIn(scope),\n', replace: '' }],
    tests,
  },
  {
    name: 'the service is built into a scope of its own, released at once',
    edits: [
      {
        file,
        find: 'Effect.flatMap(layer => Layer.buildWithScope(layer, scope)),',
        replace: 'Effect.flatMap(layer => Effect.scoped(Layer.build(layer))),',
      },
    ],
    tests,
  },
  {
    name: 'the loaded Layer is built without the rest of `resources`',
    edits: [{ file, find: '        Effect.provideContext(context),\n', replace: '' }],
    tests,
  },
]
