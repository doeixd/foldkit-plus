/**
 * The Slider's list of thumbs, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/sliderList.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = [
  'packages/mixins-ui/test/sliderList.browser.test.ts',
  'packages/mixins-ui/test/slider.test.ts',
]

export default [
  {
    name: 'a thumb passes its upper neighbour',
    edits: [
      {
        file: '../src/slider.ts',
        find: 'values[index + 1] ?? max)',
        replace: 'max)',
      },
    ],
    tests,
  },
  {
    name: 'a thumb passes its lower neighbour',
    edits: [
      {
        file: '../src/slider.ts',
        find: 'values[index - 1] ?? min)',
        replace: 'min)',
      },
    ],
    tests,
  },
  {
    name: 'a thumb is bounded by the whole track',
    edits: [
      {
        file: '../src/slider.ts',
        find: 'from: values[index - 1] ?? bounds.min,',
        replace: 'from: bounds.min,',
      },
    ],
    tests,
  },
  {
    name: 'the thumbs are all named alike',
    edits: [
      {
        file: '../src/slider.ts',
        find: 'index: index + 1, count: values.length',
        replace: 'index: 1, count: values.length',
      },
    ],
    tests,
  },
  {
    name: 'a list’s inputs span the whole track',
    edits: [
      {
        file: '../src/recipes/slider.ts',
        find: 'insetInlineStart: `calc(${travel} * var(--fk-slider-from))`,',
        replace: "insetInlineStart: '0',",
      },
    ],
    tests,
  },
  {
    name: 'a preset is ignored',
    edits: [
      {
        file: '../src/slider.ts',
        find: 'view(layered(config, options), h)',
        replace: 'view(options, h)',
      },
    ],
    tests,
  },
]
