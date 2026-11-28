export default [
  {
    name: 'a second return Schema replaces the first',
    edits: [
      {
        file: '../src/fn.ts',
        find: "  if (Option.isSome(returnSchema)) {\n    throw new Error('[metakit/fn] a return Schema is already set')",
        replace:
          "  if (false) {\n    throw new Error('[metakit/fn] a return Schema is already set')",
      },
    ],
    tests: ['packages/metakit/test/t10-duplicate-returns.test.ts'],
  },
]
