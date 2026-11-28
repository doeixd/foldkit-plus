const tests = ['packages/metakit/test/null-strict.test.ts']

export default [
  {
    name: 'holdsNoNulText accepts every array without checking element schemas',
    edits: [
      {
        file: '../src/ops/kind.ts',
        find: `(SchemaAST.isArrays(member) &&
        member.elements.every(holdsNoNulText) &&
        member.rest.every(holdsNoNulText)) ||`,
        replace: 'SchemaAST.isArrays(member) ||',
      },
    ],
    tests,
  },
]
