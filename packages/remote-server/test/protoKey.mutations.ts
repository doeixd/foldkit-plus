/**
 * A field named like an `Object.prototype` member, read by the memory backend
 * and by a write's path through the viewer:
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
  {
    name: 'a write reads a withheld member through the prototype',
    edits: [
      {
        file: '../src/index.ts',
        find: 'onSome: values => (Object.hasOwn(values, key) ? values[key] : undefined),',
        replace: 'onSome: values => values[key],',
      },
    ],
    tests: ['packages/remote-server/test/protoKey.test.ts'],
  },
]
