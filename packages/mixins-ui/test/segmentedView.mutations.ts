/**
 * `Segmented.view`'s orientation and `Segmented.configure`, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/segmentedView.mutations.ts` checks that
 * a test fails for every one.
 */
const tests = ['packages/mixins-ui/test/segmentedView.browser.test.ts']

export default [
  {
    name: 'the orientation is not written on the group',
    edits: [
      {
        file: '../src/segmented.ts',
        find: "h.DataAttribute('orientation', options.orientation ?? 'horizontal'),",
        replace: "h.DataAttribute('orientation', 'horizontal'),",
      },
    ],
    tests,
  },
  {
    name: 'a vertical group is not stacked',
    edits: [
      {
        file: '../src/recipes/segmented.ts',
        find: "{ vertical: { display: 'flex', flexDirection: 'column', alignItems: 'stretch' } },",
        replace: '{ vertical: {} },',
      },
    ],
    tests,
  },
  {
    name: 'a preset is ignored',
    edits: [
      {
        file: '../src/segmented.ts',
        find: 'view(layered(config, options), h)',
        replace: 'view(options, h)',
      },
    ],
    tests,
  },
]
