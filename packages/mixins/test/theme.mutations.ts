/**
 * The theme's shadow tokens, each broken in turn: `pnpm mutate
 * packages/mixins/test/theme.mutations.ts` checks that a test fails for every one.
 */
export default [
  {
    name: 'only the first layer is drawn in the shadow color',
    edits: [
      {
        file: '../src/theme/tokens.ts',
        find: 'layers.map(layer => `${layer} ${shade}`)',
        replace: 'layers.map((layer, index) => (index === 0 ? `${layer} ${shade}` : layer))',
      },
    ],
    tests: ['packages/mixins/test/themePage.test.ts'],
  },
  {
    name: 'the dark shadow is as faint as the light one',
    edits: [{ file: '../src/theme/oklch.ts', find: ' / 0.6)`', replace: ' / 0.14)`' }],
    tests: ['packages/mixins/test/themePage.test.ts'],
  },
]
