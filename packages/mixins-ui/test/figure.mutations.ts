/**
 * The figure, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/figure.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = ['packages/mixins-ui/test/figure.test.ts']

export default [
  {
    name: 'the caption comes before the content',
    edits: [
      {
        file: '../src/figure.ts',
        find: 'return h.figure(builders.root.attrs([]), [\n    options.content,\n',
        replace: 'return h.figure(builders.root.attrs([]), [\n',
      },
      {
        file: '../src/figure.ts',
        find: 'onSome: caption => [h.figcaption(builders.caption.attrs([]), [caption])],',
        replace:
          'onSome: caption => [h.figcaption(builders.caption.attrs([]), [caption]), options.content],',
      },
    ],
    tests,
  },
  {
    name: 'a figure with no caption draws an empty one',
    edits: [
      {
        file: '../src/figure.ts',
        find: 'onNone: () => [],',
        replace: "onNone: () => [h.figcaption(builders.caption.attrs([]), [''])],",
      },
    ],
    tests,
  },
  {
    name: 'a configured figure drops its layers',
    edits: [
      {
        file: '../src/figure.ts',
        find: 'view: (options, h) => view(layered(config, options), h),',
        replace: 'view: (options, h) => view(options, h),',
      },
    ],
    tests,
  },
  {
    name: 'a caption before the content is not moved',
    edits: [
      {
        file: '../src/recipes/figure.ts',
        find: "before: { caption: variant(Style.self({ order: '-1' })) },",
        replace: 'before: {},',
      },
    ],
    tests,
  },
]
