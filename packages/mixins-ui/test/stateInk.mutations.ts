/**
 * The state ink, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/stateInk.mutations.ts` checks that a
 * test fails for every one.
 */
const browser = ['packages/mixins-ui/test/stateInk.browser.test.ts']

export default [
  {
    name: 'a bold band films its pale text',
    edits: [
      {
        file: '../src/recipes/alert.ts',
        find: "            '--_fk-state-ink': surfaceInk('var(--_fk-alert-fill)'),",
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'a subtle band films its own tint',
    edits: [
      {
        file: '../src/recipes/alert.ts',
        find: "            '--_fk-state-ink': 'var(--_fk-alert-ink)',",
        replace: "            '--_fk-state-ink': surfaceInk('var(--_fk-alert-subtle)'),",
      },
    ],
    tests: browser,
  },
  {
    name: 'a hover ignores the paint under it',
    edits: [
      {
        file: '../src/recipes/design.ts',
        find: 'var(--_fk-state-ink, ${ref.state.ink}) ${',
        replace: '${ref.state.ink} ${',
      },
    ],
    tests: [...browser, 'packages/mixins-ui/test/recipes.test.ts'],
  },
  {
    name: 'no tone names a state ink',
    edits: [
      {
        file: '../src/recipes/design.ts',
        find: "      '--_fk-state-ink': value.stateInk,",
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'the neutral tone hides the theme’s ink',
    edits: [
      {
        file: '../src/recipes/design.ts',
        find: '    line: ref.outline.default,\n    stateInk: ref.state.ink,',
        replace: "    line: ref.outline.default,\n    stateInk: 'currentColor',",
      },
    ],
    tests: browser,
  },
]
