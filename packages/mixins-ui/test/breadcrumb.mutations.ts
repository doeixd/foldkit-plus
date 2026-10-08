/**
 * The breadcrumb trail, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/breadcrumb.mutations.ts` checks that
 * a test fails for every one.
 */
const tests = ['packages/mixins-ui/test/breadcrumb.test.ts']

export default [
  {
    name: 'the current page links onward',
    edits: [
      {
        file: '../src/breadcrumb.ts',
        find: "? [h.span(builders.current.attrs([h.AriaCurrent('page')]), [step.label])]",
        replace: '? [h.span(builders.current.attrs(), [step.label])]',
      },
    ],
    tests,
  },
  {
    name: 'dividers go missing',
    edits: [
      {
        file: '../src/recipes/breadcrumb.ts',
        find: '        content: \'"/"\',',
        replace: '        content: \'""\',',
      },
    ],
    tests,
  },
]
