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
  {
    name: 'a surface step keeps as little of the tint as the base',
    edits: [
      {
        file: '../src/theme/oklch.ts',
        find: 'muted: surfaceStep([-0.04, 2], [-0.03, 1.8]),',
        replace: 'muted: surfaceStep([-0.04, 0.8], [-0.03, 0.5]),',
      },
    ],
    tests: ['packages/mixins/test/theme.browser.test.ts'],
  },
  {
    name: 'an outline keeps as little of the tint as the base',
    edits: [
      {
        file: '../src/theme/oklch.ts',
        find: 'default: ld(scale(base, -0.13, 2.1), scale(base, 0.12, 2)),',
        replace: 'default: ld(scale(base, -0.13, 1.1), scale(base, 0.12, 1)),',
      },
    ],
    tests: ['packages/mixins/test/theme.browser.test.ts'],
  },
]
