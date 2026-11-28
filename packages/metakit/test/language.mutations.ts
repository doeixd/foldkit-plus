const tests = ['packages/metakit/test/language.test.ts']

export default [
  {
    name: 'language.sql skips missing lowering check',
    edits: [
      {
        file: '../src/language.ts',
        find: '        if (!hasLowering) {\n          throw new Error(',
        replace: '        if (false && !hasLowering) {\n          throw new Error(',
      },
    ],
    tests,
  },
  {
    name: 'language.describe returns empty list',
    edits: [
      {
        file: '../src/language.ts',
        find: '    describe: () => operations.map(describeOp),',
        replace: '    describe: () => [],',
      },
    ],
    tests,
  },
]
