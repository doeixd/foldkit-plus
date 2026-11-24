export default [
  {
    name: 'a custom operation argument must be of one scalar kind',
    edits: [
      {
        file: '../src/operation.ts',
        find: 'if (!scalarArgument(storedSchema(argument, id, label))) unsupportedSchema(argument, id, label)',
        replace:
          'if (scalarKindOf(storedSchema(argument, id, label)) === undefined) unsupportedSchema(argument, id, label)',
      },
    ],
    tests: ['packages/metakit/test/operation.test.ts'],
  },
]
