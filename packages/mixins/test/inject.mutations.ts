/**
 * Style injection, broken:
 * `pnpm mutate packages/mixins/test/inject.mutations.ts`.
 */
export default [
  {
    name: 'the injected sheet repeats no layer order where the page has one',
    edits: [
      {
        file: '../src/inject.ts',
        find: 'element.textContent = into.order ?? layerOrder()',
        replace: "element.textContent = into.order === undefined ? layerOrder() : ''",
      },
    ],
    tests: ['packages/mixins/test/inject.test.ts'],
  },
]
