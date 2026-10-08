/**
 * The scroll area, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/scrollArea.mutations.ts` checks that
 * a test fails for every one.
 */
const tests = ['packages/mixins-ui/test/scrollArea.test.ts']

export default [
  {
    name: 'the box leaves the tab order',
    edits: [
      {
        file: '../src/scrollArea.ts',
        find: 'builders.viewport.attrs([h.Tabindex(0)])',
        replace: 'builders.viewport.attrs([])',
      },
    ],
    tests,
  },
  {
    name: 'scrolling chains past the edge',
    edits: [
      {
        file: '../src/recipes/scrollArea.ts',
        find: "Style.self({ overscrollBehavior: 'contain' }),",
        replace: "Style.self({ overscrollBehavior: 'auto' }),",
      },
    ],
    tests,
  },
  {
    name: 'vertical scrolls both axes',
    edits: [
      {
        file: '../src/recipes/scrollArea.ts',
        find: "viewport: variant(Style.self({ overflowBlock: 'auto', overflowInline: 'hidden' })),",
        replace:
          "viewport: variant(Style.self({ overflowBlock: 'auto', overflowInline: 'auto' })),",
      },
    ],
    tests,
  },
]
