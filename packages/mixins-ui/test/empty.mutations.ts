/**
 * The empty state, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/empty.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = ['packages/mixins-ui/test/empty.test.ts']

export default [
  {
    name: 'empty states left-align',
    edits: [
      {
        file: '../src/recipes/empty.ts',
        find: "textAlign: 'center',",
        replace: "textAlign: 'start',",
      },
    ],
    tests,
  },
  {
    name: 'icons go missing',
    edits: [
      {
        file: '../src/empty.ts',
        find: '...(options.icon === undefined ? [] : [h.div(builders.icon.attrs(), [options.icon])]),',
        replace: '',
      },
    ],
    tests,
  },
]
