/**
 * The table, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/table.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = ['packages/mixins-ui/test/table.test.ts']

export default [
  {
    name: 'numbers start-align with everything else',
    edits: [
      {
        file: '../src/recipes/table.ts',
        find: "Style.nest('&[data-numeric]', { textAlign: 'end' }),",
        replace: "Style.nest('&[data-numeric]', { textAlign: 'start' }),",
      },
    ],
    tests,
  },
  {
    name: 'the caption draws as a span',
    edits: [
      {
        file: '../src/table.ts',
        find: 'h.caption(builders.caption.attrs(), [options.caption])',
        replace: 'h.span(builders.caption.attrs(), [options.caption])',
      },
    ],
    tests,
  },
]
