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
        find: 'muted: surfaceStep([-0.04, 1.2], [-0.03, 1.05]),',
        replace: 'muted: surfaceStep([-0.04, 0.8], [-0.03, 0.5]),',
      },
    ],
    tests: ['packages/mixins/test/theme.browser.test.ts'],
  },
  {
    name: 'a surface step in the dark is bluer than the page',
    edits: [
      {
        file: '../src/theme/oklch.ts',
        find: 'subtle: surfaceStep([-0.025, 1.15], [-0.015, 1.05]),',
        replace: 'subtle: surfaceStep([-0.025, 1.15], [-0.015, 1.8]),',
      },
    ],
    tests: ['packages/mixins/test/theme.browser.test.ts'],
  },
  {
    name: 'an outline keeps as little of the tint as the base',
    edits: [
      {
        file: '../src/theme/oklch.ts',
        find: 'default: ld(scale(base, -0.13, 1.4), scale(base, 0.12, 1.35)),',
        replace: 'default: ld(scale(base, -0.13, 1), scale(base, 0.12, 0.9)),',
      },
    ],
    tests: ['packages/mixins/test/theme.browser.test.ts'],
  },
  {
    name: 'an outline is another, bluer color than the page',
    edits: [
      {
        file: '../src/theme/oklch.ts',
        find: 'subtle: ld(scale(base, -0.07, 1.3), scale(base, 0.065, 1.25)),',
        replace: 'subtle: ld(scale(base, -0.07, 2.2), scale(base, 0.065, 2.2)),',
      },
    ],
    tests: ['packages/mixins/test/theme.browser.test.ts'],
  },
]
