/**
 * The icon, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/icon.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = ['packages/mixins-ui/test/icon.test.ts']

export default [
  {
    name: 'a decorative icon is announced',
    edits: [
      {
        file: '../src/icon.ts',
        find: 'builders.glyph.attrs([h.AriaHidden(true)])',
        replace: 'builders.glyph.attrs([])',
      },
    ],
    tests,
  },
]
