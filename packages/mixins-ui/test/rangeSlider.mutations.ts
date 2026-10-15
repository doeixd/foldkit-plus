/**
 * The range slider, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/rangeSlider.mutations.ts` checks that
 * a test fails for every one.
 */
const unit = 'packages/mixins-ui/test/rangeSlider.test.ts'
const browser = 'packages/mixins-ui/test/rangeSlider.browser.test.ts'

export default [
  {
    name: 'the whole input takes the pointer',
    edits: [
      {
        file: '../src/recipes/rangeSlider.ts',
        find: "pointerEvents: 'none',",
        replace: "pointerEvents: 'auto',",
      },
    ],
    tests: [browser],
  },
  {
    name: 'met at the top, the low thumb stays under',
    edits: [
      {
        file: '../src/recipes/rangeSlider.ts',
        find: 'Style.nest(\'[data-raised="low"] > &[data-thumb="low"]\', { zIndex: \'1\' }),',
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the low thumb is bounded by the top, not the high thumb',
    edits: [
      {
        file: '../src/rangeSlider.ts',
        find: "thumb('low', low, min, high),",
        replace: "thumb('low', low, min, max),",
      },
    ],
    tests: [unit, browser],
  },
]
