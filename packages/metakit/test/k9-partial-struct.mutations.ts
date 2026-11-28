export default [
  {
    name: 'an omitted optional struct key counts as known',
    edits: [
      {
        file: '../src/ops/partial.ts',
        find: 'return held !== undefined && isWhole(held, Option.some(property.type))',
        replace:
          'return held === undefined ? SchemaAST.isOptional(property.type) : isWhole(held, Option.some(property.type))',
      },
    ],
    tests: ['packages/metakit/test/k9-partial-struct.test.ts'],
  },
]
