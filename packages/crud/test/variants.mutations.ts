/**
 * An editor over a variant Entity, and what it loads beside the form (#357):
 * `pnpm mutate packages/crud/test/variants.mutations.ts`.
 */
export default [
  {
    name: 'selectFor reads nothing beside the input',
    edits: [
      {
        file: '../../entity/src/entity.ts',
        find: '{ ...spec, ...options.also }',
        replace: 'spec',
      },
    ],
    tests: ['packages/crud/test/editor.test.ts'],
  },
  {
    name: 'an editor loads a variant row as the stored row',
    edits: [
      {
        file: '../../entity/src/entity.ts',
        find: '  return Schema.TaggedUnion(cases)\n',
        replace: '  return Schema.Struct(selected)\n',
      },
    ],
    tests: ['packages/crud/test/variants.test.ts'],
  },
]
