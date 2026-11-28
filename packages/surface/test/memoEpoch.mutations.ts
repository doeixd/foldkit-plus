const tests = ['packages/surface/test/memoEpoch.test.ts']

export default [
  {
    name: 'Projection.derive ignores unchanged pathEpoch and always compares values',
    edits: [
      {
        file: '../src/index.ts',
        find: 'if (before !== undefined && nextEpoch !== undefined && nextEpoch === before.epoch) {',
        replace:
          'if (false && before !== undefined && nextEpoch !== undefined && nextEpoch === before.epoch) {',
      },
    ],
    tests,
  },
]
