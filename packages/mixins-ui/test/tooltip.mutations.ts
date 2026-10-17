/**
 * The tooltip's top layer and arrow, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/tooltip.mutations.ts` checks that a
 * test fails for every one.
 */
const browser = ['packages/mixins-ui/test/tooltip.browser.test.ts']

export default [
  {
    name: 'the tooltip draws no layer',
    edits: [{ file: '../src/tooltip.ts', find: '    layer: layer(context.h),\n', replace: '' }],
    tests: browser,
  },
  {
    name: 'the arrow is never placed',
    edits: [
      {
        file: '../src/tooltip.ts',
        find: '      context.h.OnMount(PlaceArrow({ buttonId: triggerId(context.id) })),\n',
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'the arrow forgets the panel’s border',
    edits: [
      {
        file: '../src/anchor.ts',
        find: '                box.left -\n                panel.clientLeft -',
        replace: '                panel.clientLeft -',
      },
    ],
    tests: browser,
  },
  {
    name: 'the panel scrolls and clips its arrow',
    edits: [
      {
        file: '../src/recipes/tooltip.ts',
        find: "        overflow: 'visible !important',\n",
        replace: '',
      },
    ],
    tests: browser,
  },
]
