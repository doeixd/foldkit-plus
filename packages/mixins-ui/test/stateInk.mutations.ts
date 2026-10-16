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
        find: "            '--fk-state-ink': surfaceInk('var(--_fk-alert-fill)'),",
        replace: '',
      },
    ],
    tests: [...browser, 'packages/mixins-ui/test/alert.test.ts'],
  },
  {
    name: 'a hover ignores the paint under it',
    edits: [
      {
        file: '../src/recipes/design.ts',
        find: "export const unfilledHover = `color-mix(in oklab, ${ref.state.ink} ${ref.knob['state-hover']}, transparent)`",
        replace: 'export const unfilledHover = ref.state.hover',
      },
    ],
    tests: [...browser, 'packages/mixins-ui/test/recipes.test.ts'],
  },
  {
    name: 'no tone names a state ink',
    edits: [
      {
        file: '../src/recipes/design.ts',
        find: "      '--fk-state-ink': value.stateInk,",
        replace: '',
      },
    ],
    tests: ['packages/mixins-ui/test/buttonLook.test.ts'],
  },
]
