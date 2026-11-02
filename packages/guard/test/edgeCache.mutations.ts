/**
 * A guarded read kept anyway, which the two-principal checker must refuse.
 * `GuardServer.memory` gives a Source both a row rule (`readable`) and a
 * member rule (`filter`), so keeping it anyway ignores every rule:
 * `pnpm mutate packages/guard/test/edgeCache.mutations.ts`
 */
const tests = ['packages/guard/test/edgeCache.test.ts']

export default [
  {
    name: "a read under the guard's rules is kept, answered as the visitor",
    edits: [
      {
        file: '../../remote-server/src/edgeCache.ts',
        find: '  source.authorize !== undefined ||\n  source.filter !== undefined ||\n  source.visible !== undefined ||\n',
        replace: '',
      },
    ],
    tests,
  },
]
