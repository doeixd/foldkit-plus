/**
 * The default theme's contrast, broken in turn:
 * `pnpm mutate packages/mixins/test/defaultTheme.mutations.ts`.
 */
const oklch = '../src/theme/oklch.ts'
const knobs = '../src/theme/knobs.ts'
const tests = ['packages/mixins/test/defaultTheme.browser.test.ts']

export default [
  {
    name: 'a link lighter than the accent',
    edits: [
      {
        file: oklch,
        find: "link: v('accent', 'ink'),",
        replace: 'link: shift(accent, 0.1, 0.05),',
      },
    ],
    tests,
  },
  {
    name: 'the accent ink at 0.5, short on the muted surface',
    edits: [{ file: oklch, find: "from(color, '0.45', 'c')", replace: "from(color, '0.5', 'c')" }],
    tests,
  },
  {
    name: 'a dark page too light for muted text',
    edits: [
      {
        file: knobs,
        find: "variable: 'base-l-dark',\n        default: 24.5,",
        replace: "variable: 'base-l-dark',\n        default: 36,",
      },
    ],
    tests,
  },
  {
    name: 'an accent too light for a label on its fill',
    edits: [
      {
        file: knobs,
        find: "variable: 'accent-l',\n        default: 55,",
        replace: "variable: 'accent-l',\n        default: 63,",
      },
    ],
    tests,
  },
]
