/**
 * A slot named like an `Object.prototype` member that the base leaves out:
 * `pnpm mutate packages/mixins-ui/test/protoKey.mutations.ts`.
 */
export default [
  {
    name: 'resolveFor reads the base through the prototype',
    edits: [
      {
        file: '../src/resolve.ts',
        find: 'Object.hasOwn(base, name) ? base[name as keyof Slots] : undefined',
        replace: 'base[name as keyof Slots]',
      },
    ],
    tests: ['packages/mixins-ui/test/protoKey.test.ts'],
  },
]
