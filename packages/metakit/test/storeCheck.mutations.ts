const tests = ['packages/metakit/test/storeCheck.test.ts']

export default [
  {
    name: 'checkStore skips serializable transaction probe',
    edits: [
      {
        file: '../src/storeCheck.ts',
        find: "    const checkSerializableTx =\n      declared.isolation === 'serializable' && declared.isolates === 'transaction'",
        replace: '    const checkSerializableTx = false',
      },
    ],
    tests,
  },
  {
    name: 'checkStore skips parentRowLock probe',
    edits: [
      {
        file: '../src/storeCheck.ts',
        find: '      if (declared.parentRowLock) {',
        replace: '      if (false && declared.parentRowLock) {',
      },
    ],
    tests,
  },
]
