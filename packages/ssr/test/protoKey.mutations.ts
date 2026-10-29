/**
 * A Message field named like an `Object.prototype` member is a hole an event
 * fills: `pnpm mutate packages/ssr/test/protoKey.mutations.ts`.
 */
export default [
  {
    name: 'a field counts as fixed when the prototype has it',
    edits: [
      {
        file: '../src/resumable.ts',
        find: '!Object.hasOwn(fixed, field)',
        replace: '!(field in fixed)',
      },
    ],
    tests: ['packages/ssr/test/protoKey.test.ts'],
  },
]
