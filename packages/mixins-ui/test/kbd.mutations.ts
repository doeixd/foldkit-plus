/**
 * The keyboard key, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/kbd.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = ['packages/mixins-ui/test/kbd.test.ts']

export default [
  {
    name: 'keys set proportionally spaced',
    edits: [
      {
        file: '../src/recipes/kbd.ts',
        find: 'fontFamily: ref.font.mono,',
        replace: 'fontFamily: ref.font.body,',
      },
    ],
    tests,
  },
  {
    name: 'keys lose their lower edge',
    edits: [
      {
        file: '../src/recipes/kbd.ts',
        find: 'borderBlockEndWidth: ref.border.thick,',
        replace: '',
      },
    ],
    tests,
  },
]
