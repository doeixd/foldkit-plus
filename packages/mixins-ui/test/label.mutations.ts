/**
 * The label, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/label.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = ['packages/mixins-ui/test/label.test.ts']

export default [
  {
    name: 'labels point nowhere',
    edits: [
      {
        file: '../src/label.ts',
        find: 'h.label(builders.label.attrs([h.For(options.for)]), [options.text])',
        replace: 'h.label(builders.label.attrs([]), [options.text])',
      },
    ],
    tests,
  },
  {
    name: 'labels read regular weight',
    edits: [
      {
        file: '../src/recipes/label.ts',
        find: 'fontWeight: ref.weight.semibold,',
        replace: 'fontWeight: ref.weight.normal,',
      },
    ],
    tests,
  },
]
