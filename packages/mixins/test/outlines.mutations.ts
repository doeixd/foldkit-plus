/**
 * The divider's step, broken in turn:
 * `pnpm mutate packages/mixins/test/outlines.mutations.ts`.
 */
const browser = ['packages/mixins/test/outlines.browser.test.ts']
const file = '../src/theme/oklch.ts'

export default [
  {
    name: 'a divider is the subtle line',
    edits: [
      {
        file,
        find: 'divider: inked(ld(scale(base, -0.1, 1.35), scale(base, 0.095, 1.3)),',
        replace: 'divider: inked(ld(scale(base, -0.07, 1.3), scale(base, 0.065, 1.25)),',
      },
    ],
    tests: browser,
  },
  {
    name: 'a dark page draws its divider as faint as subtle',
    edits: [{ file, find: 'scale(base, 0.095, 1.3)', replace: 'scale(base, 0.065, 1.3)' }],
    tests: browser,
  },
  {
    name: 'a divider is the default line',
    edits: [
      {
        file,
        find: 'divider: inked(ld(scale(base, -0.1, 1.35), scale(base, 0.095, 1.3)),',
        replace: 'divider: inked(ld(scale(base, -0.13, 1.4), scale(base, 0.12, 1.35)),',
      },
    ],
    tests: browser,
  },
]
