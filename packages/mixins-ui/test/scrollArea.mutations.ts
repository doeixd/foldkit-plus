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
        find: '[h.Tabindex(0), ...(overlay',
        replace: '[...(overlay',
      },
    ],
    tests,
  },
  {
    name: 'scrolling chains past the edge',
    edits: [
      {
        file: '../src/recipes/scrollArea.ts',
        find: "Style.self({ overscrollBehavior: 'contain', minBlockSize: '0' }),",
        replace: "Style.self({ overscrollBehavior: 'auto', minBlockSize: '0' }),",
      },
    ],
    tests,
  },
  {
    name: 'the overlay bars run unasked',
    edits: [
      {
        file: '../src/scrollArea.ts',
        find: 'const overlay = options.overlayBars === true',
        replace: 'const overlay = true',
      },
    ],
    tests,
  },
  {
    name: 'the bars are drawn without their Mount',
    edits: [
      {
        file: '../src/scrollArea.ts',
        find: '...(overlay ? [h.OnMount(ScrollBars({}))] : [])',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'vertical scrolls both axes',
    edits: [
      {
        file: '../src/recipes/scrollArea.ts',
        find: "Style.self({ overflowBlock: 'auto', overflowInline: 'hidden' }),",
        replace: "Style.self({ overflowBlock: 'auto', overflowInline: 'auto' }),",
      },
    ],
    tests,
  },
]
