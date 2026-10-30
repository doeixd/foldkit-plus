/**
 * A field named like an `Object.prototype` member, read by the memory backend:
 * `pnpm mutate packages/remote-server/test/protoKey.mutations.ts`.
 */
export default [
  {
    name: 'the memory backend reads a field’s window through the prototype',
    edits: [
      {
        file: '../src/index.ts',
        find: `windows !== undefined && Object.hasOwn(windows, field)
                                  ? windows[field]
                                  : undefined,`,
        replace: 'windows?.[field],',
      },
    ],
    tests: ['packages/remote-server/test/protoKey.test.ts'],
  },
]
