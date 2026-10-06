/**
 * The theme's tints, broken in turn: `pnpm mutate packages/mixins/test/theme.mutations.ts`
 * checks that a test fails for every one.
 */
export default [
  {
    name: 'a tint is mixed in OKLCH, and takes the base hue',
    edits: [
      {
        file: '../src/theme/oklch.ts',
        find: "`color-mix(in oklab, ${v('surface', 'base')} ${percent}%, ${color})`",
        replace: "`color-mix(in oklch, ${v('surface', 'base')} ${percent}%, ${color})`",
      },
    ],
    tests: ['packages/mixins/test/theme.browser.test.ts'],
  },
]
