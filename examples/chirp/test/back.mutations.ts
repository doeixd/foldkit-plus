/**
 * Going back to a page within its window (#234), broken in turn:
 * `pnpm mutate examples/chirp/test/back.mutations.ts`.
 */
const tests = ['examples/chirp/test/back.test.ts']

export default [
  {
    name: 'a list left is held stale whatever its readers',
    edits: [
      { file: '../../../packages/remote/src/model.ts', find: ' || ages === true', replace: '' },
    ],
    tests,
  },
  {
    name: 'Chirp reads without a window',
    edits: [
      {
        file: '../src/app.ts',
        find: 'Data.wiring(actives, { policy: freshness })',
        replace: 'Data.wiring(actives)',
      },
    ],
    tests,
  },
]
