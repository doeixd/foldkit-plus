/**
 * `Bundles.AngleSlider`, the AngleSlider's words and its `configure`, broken
 * in turn: `pnpm mutate packages/mixins-ui/test/angleSliderBundle.mutations.ts`
 * checks that a test fails for every one.
 */
const tests = ['packages/mixins-ui/test/angleSliderBundle.test.ts']

export default [
  {
    name: 'the layout in the args is not given to update',
    edits: [
      {
        file: '../src/bundles/angleSlider.ts',
        find: 'update: (model, message, args) => foldFor(args)(model, message),',
        replace: 'update: (model, message) => foldFor({})(model, message),',
      },
    ],
    tests,
  },
  {
    name: 'a layout update refuses is placed all the same',
    edits: [
      {
        file: '../src/bundles/angleSlider.ts',
        find: '    foldFor(args)\n    return { model: init(args) }',
        replace: '    return { model: init(args) }',
      },
    ],
    tests,
  },
  {
    name: 'the words are not read',
    edits: [
      {
        file: '../src/angleSlider.ts',
        find: 'fill(wordsOf(words, options.words).degrees, { value })',
        replace: 'fill(words.degrees, { value })',
      },
    ],
    tests,
  },
  {
    name: 'a preset is ignored',
    edits: [
      {
        file: '../src/angleSlider.ts',
        find: 'view(layered(config, options), h)',
        replace: 'view(options, h)',
      },
    ],
    tests,
  },
]
