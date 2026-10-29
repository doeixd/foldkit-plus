/**
 * Names that `Object.prototype` also holds, as a Message's field, a variants
 * key or a recorded input's key: `pnpm mutate packages/agent/test/protoKey.mutations.ts`.
 */
export default [
  {
    name: 'the payload fields are gathered on a plain object',
    edits: [
      {
        file: '../src/expose.ts',
        find: 'const payload: Record<string, unknown> = Object.create(null)',
        replace: 'const payload: Record<string, unknown> = {}',
      },
    ],
    tests: ['packages/agent/test/expose.test.ts'],
  },
  {
    name: 'a variants key is looked up on the union with its inherited members',
    edits: [
      {
        file: '../src/expose.ts',
        find: 'const constructor = Object.hasOwn(union, tag) ? union[tag] : undefined',
        replace: 'const constructor = union[tag]',
      },
    ],
    tests: ['packages/agent/test/expose.test.ts'],
  },
  {
    name: 'a recorded input is copied by assignment',
    edits: [
      {
        file: '../src/audit.ts',
        find: `    Object.defineProperty(copy, key, {
      value: snapshot(item, seen),
      writable: true,
      enumerable: true,
      configurable: true,
    })`,
        replace: '    copy[key] = snapshot(item, seen)',
      },
    ],
    tests: ['packages/agent/test/audit.test.ts'],
  },
]
