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
  {
    name: 'a family’s line darkens in a dark scheme too',
    edits: [
      {
        file: '../src/theme/oklch.ts',
        find: 'outline: ld(shift(color, -0.05, 0), shift(color, 0.05, 0)),',
        replace: 'outline: shift(color, -0.05, 0),',
      },
    ],
    tests: ['packages/mixins/test/theme.browser.test.ts'],
  },
  {
    name: 'a feedback fill is as dark in a dark scheme',
    edits: [
      {
        file: '../src/theme/oklch.ts',
        find: '`oklch(${dark}%',
        replace: '`oklch(${l}%',
      },
    ],
    tests: ['packages/mixins/test/theme.browser.test.ts'],
  },
  {
    name: 'bedrock is near-white in a dark scheme',
    edits: [
      {
        file: '../src/theme/oklch.ts',
        find: '`oklch(6% calc(${surfaceCDark} * 1.2) ${neutral})`',
        replace: '`oklch(98% calc(${surfaceCDark} * 0.7) ${neutral})`',
      },
    ],
    tests: ['packages/mixins/test/theme.browser.test.ts'],
  },
  {
    name: 'the focus ring is the accent darkened and saturated',
    edits: [
      {
        file: '../src/theme/oklch.ts',
        find: '      focus: accent,',
        replace: '      focus: shift(accent, -0.1, 0.1),',
      },
    ],
    tests: ['packages/mixins/test/theme.browser.test.ts'],
  },
  {
    name: 'the error fill takes dark text in a dark scheme',
    edits: [
      {
        file: '../src/theme/oklch.ts',
        find: "error: feedback('error', 60, 0.2, 64),",
        replace: "error: feedback('error', 60, 0.2, 66),",
      },
    ],
    tests: ['packages/mixins/test/theme.browser.test.ts'],
  },
  {
    name: 'every shadow answers to the strength knob',
    edits: [
      {
        file: '../src/theme/tokens.ts',
        find: '`${layer} color-mix(in oklch, ${shade} ${strength}, transparent)`',
        replace: '`${layer} color-mix(in oklch, ${shade} 100%, transparent)`',
      },
    ],
    tests: ['packages/mixins/test/themePage.test.ts'],
  },
  {
    name: 'modals sink deeper than panels',
    edits: [
      {
        file: '../src/theme/tokens.ts',
        find: "    '2xl': shadow('0 32px 64px -16px', '0 12px 24px -12px'),",
        replace: "    '2xl': shadow('0 24px 48px -12px', '0 8px 16px -8px'),",
      },
    ],
    tests: ['packages/mixins/test/themePage.test.ts'],
  },
]
