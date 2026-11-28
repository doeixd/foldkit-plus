/**
 * `observeEntry` read-plan skipping mutations:
 * `pnpm mutate packages/remote/test/observeSkip.mutations.ts`
 */
const tests = ['packages/remote/test/observeSkip.test.ts']

export default [
  {
    name: 'askReads treats unknown opaque Surface.at as empty reads instead of undefined',
    edits: [
      {
        file: '../src/active.ts',
        find: '  return undefined\n}',
        replace: '  return []\n}',
      },
    ],
    tests,
  },
  {
    name: 'observeEntry ignores declared reads comparison and reuses stale plan when route changes',
    edits: [
      {
        file: '../src/domain.ts',
        find: 'readValues.every((value, index) => Object.is(value, last!.readValues[index]))',
        replace: 'true',
      },
    ],
    tests,
  },
]
