/**
 * One disabled fade, broken in turn: the shared rule's token, a recipe's own
 * token, and the knob's default. `pnpm mutate
 * packages/mixins-ui/test/disabled.mutations.ts` checks that a test fails for
 * every one.
 */
const unit = ['packages/mixins-ui/test/recipes.test.ts']
const browser = ['packages/mixins-ui/test/disabled.browser.test.ts']

export default [
  {
    name: 'the shared disabled rule fades by a literal',
    edits: [
      {
        file: '../src/recipes/design.ts',
        find: "opacity: ref.knob['state-disabled'],",
        replace: "opacity: '0.5',",
      },
    ],
    tests: unit,
  },
  {
    name: 'a recipe keeps its own fade',
    edits: [
      {
        file: '../src/recipes/calendar.ts',
        find: "      opacity: ref.knob['state-disabled'],\n      cursor: 'not-allowed',",
        replace: "      opacity: '0.4',\n      cursor: 'not-allowed',",
      },
    ],
    tests: unit,
  },
  {
    name: 'a disabled calendar day keeps its own fade',
    edits: [
      {
        file: '../src/recipes/calendar.ts',
        find: "      opacity: ref.knob['state-disabled'],\n      cursor: 'not-allowed',",
        replace: "      opacity: '0.4',\n      cursor: 'not-allowed',",
      },
    ],
    tests: ['packages/mixins-ui/test/calendar.browser.test.ts'],
  },
  {
    name: 'the disabled knob’s default is another value',
    edits: [
      { file: '../../mixins/src/theme/knobs.ts', find: 'default: 0.5,', replace: 'default: 0.4,' },
    ],
    tests: browser,
  },
]
