/**
 * `entity()` refuses a computed count over a `single` many relation, which
 * reads as one ref: `pnpm mutate packages/remote-drizzle/test/computedSingle.mutations.ts`.
 */
export default [
  {
    name: 'a computed count over a single many relation is accepted',
    edits: [
      {
        file: '../src/binding.ts',
        find: "      (relation.kind === 'many' && relation.single === true)\n    ) {",
        replace: "      (relation.kind === 'many' && relation.single === false)\n    ) {",
      },
    ],
    tests: ['packages/remote-drizzle/test/index.test.ts'],
  },
]
