/**
 * The separator, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/separator.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = ['packages/mixins-ui/test/separator.test.ts']

export default [
  {
    name: 'every rule stands vertical',
    edits: [
      {
        file: '../src/separator.ts',
        find: "h.AriaOrientation(vertical ? 'vertical' : 'horizontal')",
        replace: "h.AriaOrientation('vertical')",
      },
    ],
    tests,
  },
  {
    name: 'vertical rules run along the row',
    edits: [
      {
        file: '../src/recipes/separator.ts',
        find: "rule: variant(\n          Style.self({ inlineSize: ref.border.thin, blockSize: '100%', alignSelf: 'stretch' }),\n        ),",
        replace: "rule: variant(Style.self({ inlineSize: '100%', blockSize: ref.border.thin })),",
      },
    ],
    tests,
  },
]
