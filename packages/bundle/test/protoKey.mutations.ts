/**
 * A child field named like an `Object.prototype` member, kept in the composed
 * Model: `pnpm mutate packages/bundle/test/protoKey.mutations.ts`.
 */
export default [
  {
    name: "a child's field is assigned into the parent's fields",
    edits: [
      {
        file: '../src/compose.ts',
        find: 'Object.defineProperties(fields, Object.getOwnPropertyDescriptors(declaration.fields))',
        replace: 'Object.assign(fields, declaration.fields)',
      },
    ],
    tests: ['packages/bundle/test/compose.test.ts'],
  },
]
