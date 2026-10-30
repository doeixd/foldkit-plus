/**
 * Variants of an Entity (#357) in Remote's store, broken:
 * `pnpm mutate packages/remote/test/variants.mutations.ts`.
 */
export default [
  {
    name: 'an Entity Selection is read as the flat stored row',
    edits: [
      {
        file: '../src/selection.ts',
        find: '      schema: Domain.Entity.selectionSchema(\n',
        replace: '      schema: ((_: unknown, __: unknown) => remote.schema)(\n',
      },
    ],
    tests: ['packages/remote/test/variants.test.ts'],
  },
]
