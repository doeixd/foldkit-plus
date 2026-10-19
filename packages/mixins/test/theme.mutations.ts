/**
 * The theme's tints, broken in turn: `pnpm mutate packages/mixins/test/theme.mutations.ts`
 * checks that a test fails for every one.
 */
export default [
  {
    name: 'headings ignore heading-scale',
    edits: [
      {
        file: '../src/theme/tokens.ts',
        find: 'rem * var(--fk-knob-heading-scale, 1)) * ${textScale})`',
        replace: 'rem) * ${textScale})`',
      },
    ],
    tests: ['packages/mixins/test/theme.browser.test.ts'],
  },
  {
    name: 'the line height ignores its knob',
    edits: [
      {
        file: '../src/theme/tokens.ts',
        find: 'const leading = (ratio: number) => `calc(${ratio} * var(--fk-knob-leading, 1))`',
        replace: 'const leading = (ratio: number) => String(ratio)',
      },
    ],
    tests: ['packages/mixins/test/theme.browser.test.ts'],
  },
  {
    name: 'text ignores text-scale',
    edits: [
      {
        file: '../src/theme/tokens.ts',
        find: "const textScale = 'var(--fk-knob-text-scale, 1)'",
        replace: "const textScale = '1'",
      },
    ],
    tests: ['packages/mixins/test/theme.browser.test.ts'],
  },
  {
    name: 'a hard shadow blurs',
    edits: [
      {
        file: '../src/theme/shadows.ts',
        find: '`${offset}px ${offset}px 0 0 color-mix',
        replace: '`${offset}px ${offset}px 4px 0 color-mix',
      },
    ],
    tests: ['packages/mixins/test/theme.browser.test.ts'],
  },
  {
    name: 'a hard shadow keeps the faint color of a soft one',
    edits: [{ file: '../src/theme/shadows.ts', find: ' l c h / 0.9)', replace: ' l c h)' }],
    tests: ['packages/mixins/test/theme.browser.test.ts'],
  },
  {
    name: 'a hard shadow ignores its strength',
    edits: [
      {
        file: '../src/theme/shadows.ts',
        find: 'l c h / 0.9) ${strength}, transparent)`',
        replace: 'l c h / 0.9) 100%, transparent)`',
      },
    ],
    tests: ['packages/mixins/test/theme.browser.test.ts'],
  },
  {
    name: 'a shadow ignores the hue it is given',
    edits: [
      {
        file: '../src/theme/oklch.ts',
        find: "'shadow-h': knobs.shadow?.h === undefined ? v('hue', 'neutral') : String(knobs.shadow.h),",
        replace: "'shadow-h': v('hue', 'neutral'),",
      },
    ],
    tests: ['packages/mixins/test/theme.browser.test.ts'],
  },
  {
    name: 'a shadow in the dark is drawn in the neutral hue',
    edits: [
      {
        file: '../src/theme/oklch.ts',
        find: "* 4 / 3) ${v('knob', 'shadow-h')} / 0.6)",
        replace: '* 4 / 3) ${neutral} / 0.6)',
      },
    ],
    tests: ['packages/mixins/test/theme.browser.test.ts'],
  },
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
        find: 'ld(scale(base, -0.13, 1.4), scale(base, 0.12, 1.35))',
        replace: 'ld(scale(base, -0.13, 1), scale(base, 0.12, 0.9))',
      },
    ],
    tests: ['packages/mixins/test/theme.browser.test.ts'],
  },
  {
    name: 'an outline is another, bluer color than the page',
    edits: [
      {
        file: '../src/theme/oklch.ts',
        find: 'ld(scale(base, -0.07, 1.3), scale(base, 0.065, 1.25))',
        replace: 'ld(scale(base, -0.07, 2.2), scale(base, 0.065, 2.2))',
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
        file: '../src/theme/shadows.ts',
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
        file: '../src/theme/shadows.ts',
        find: "    '2xl': shadow('0 32px 64px -16px', '0 12px 24px -12px'),",
        replace: "    '2xl': shadow('0 24px 48px -12px', '0 8px 16px -8px'),",
      },
    ],
    tests: ['packages/mixins/test/themePage.test.ts'],
  },
  {
    name: 'code as dark on a dark page as on a light one',
    edits: [
      {
        file: '../src/theme/oklch.ts',
        find: "`oklch(80% ${v('knob', 'syntax-c')} ${hue})`",
        replace: "`oklch(30% ${v('knob', 'syntax-c')} ${hue})`",
      },
    ],
    tests: ['packages/mixins/test/theme.browser.test.ts'],
  },
  {
    name: 'a function the color of a keyword',
    edits: [
      {
        file: '../src/theme/oklch.ts',
        find: "function: syntaxInk(v('hue', 'secondary')),",
        replace: "function: syntaxInk(v('hue', 'accent')),",
      },
    ],
    tests: ['packages/mixins/test/theme.browser.test.ts'],
  },
  {
    name: 'a neutral hue given is ignored',
    edits: [
      {
        file: '../src/theme/oklch.ts',
        find: "knobs.neutral === undefined ? v('hue', 'accent') : String(knobs.neutral.h)",
        replace: "v('hue', 'accent')",
      },
    ],
    tests: ['packages/mixins/test/theme.browser.test.ts'],
  },
  {
    name: 'the neutrals keep the accent hue they started with',
    edits: [
      {
        file: '../src/theme/oklch.ts',
        find: "knobs.neutral === undefined ? v('hue', 'accent') : String(knobs.neutral.h)",
        replace: 'String(knobs.neutral?.h ?? knobs.accent.h)',
      },
    ],
    tests: ['packages/mixins/test/theme.browser.test.ts'],
  },
  {
    name: 'a 0-or-1 knob blends the wrong way',
    edits: [
      {
        file: '../src/theme/oklch.ts',
        find: "`color-mix(in oklab, ${a} calc(${v('knob', name)} * 100%), ${b})`",
        replace: "`color-mix(in oklab, ${b} calc(${v('knob', name)} * 100%), ${a})`",
      },
    ],
    tests: ['packages/mixins/test/theme.browser.test.ts'],
  },
  {
    name: 'a translucent panel is opaque',
    edits: [
      {
        file: '../src/theme/oklch.ts',
        find: "'popup-alpha': knobs.menu?.color?.endsWith('translucent') === true ? '0.8' : '1',",
        replace: "'popup-alpha': '1',",
      },
    ],
    tests: ['packages/mixins/test/theme.browser.test.ts'],
  },
  {
    name: 'the surface contrast knob reaches only as far as its steps name',
    edits: [
      { file: '../src/theme/oklch.ts', find: 'const REACH = 2.5', replace: 'const REACH = 1' },
    ],
    tests: ['packages/mixins/test/theme.browser.test.ts'],
  },
  {
    name: 'the state ink stays the text in accent mode',
    edits: [
      {
        file: '../src/theme/knobs.ts',
        find: "accent: { 'surface-ink': '1', 'state-ink': ref('accent', 'ink') },",
        replace: "accent: { 'surface-ink': '1', 'state-ink': 'currentColor' },",
      },
    ],
    tests: ['packages/mixins/test/theme.browser.test.ts', 'packages/mixins/test/themePage.test.ts'],
  },
  {
    name: 'painted surfaces never name their ink',
    edits: [
      {
        file: '../src/theme/knobs.ts',
        find: "surface: { 'surface-ink': '1', 'state-ink': 'currentColor' },",
        replace: "surface: { 'surface-ink': '0', 'state-ink': 'currentColor' },",
      },
    ],
    tests: ['packages/mixins/test/themePage.test.ts'],
  },
  {
    name: 'a field ground is the page itself',
    edits: [
      {
        file: '../src/theme/oklch.ts',
        find: "      field: v('surface', 'default'),",
        replace: "      field: v('surface', 'base'),",
      },
    ],
    tests: ['packages/mixins/test/theme.browser.test.ts', 'packages/mixins/test/themePage.test.ts'],
  },
  {
    name: 'the second chart color on the hue of the first',
    edits: [
      {
        file: '../src/theme/oklch.ts',
        find: "'2': chartInk(145,",
        replace: "'2': chartInk(0,",
      },
    ],
    tests: ['packages/mixins/test/theme.browser.test.ts'],
  },
  {
    name: 'a chart yellow too light for a dark page',
    edits: [
      {
        file: '../src/theme/oklch.ts',
        find: '[0.764, 0.161], [0.67, 0.143]',
        replace: '[0.764, 0.161], [0.8, 0.143]',
      },
    ],
    tests: ['packages/mixins/test/theme.browser.test.ts'],
  },
]
