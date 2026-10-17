/**
 * The popover's top layer, placement defaults and arrow, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/popover.mutations.ts` checks that a
 * test fails for every one.
 */
const browser = ['packages/mixins-ui/test/popover.browser.test.ts']

export default [
  {
    name: 'the layer never enters the top layer',
    edits: [
      {
        file: '../src/anchor.ts',
        find: "  h.Attribute('popover', 'manual'),\n  h.Style({\n    position: 'fixed',",
        replace: "  h.Style({\n    position: 'fixed',",
      },
    ],
    tests: browser,
  },
  {
    name: 'the panel may touch the viewport’s edge',
    edits: [
      { file: '../src/popover.ts', find: '  gap: 12,\n  padding: 8,', replace: '  gap: 12,' },
    ],
    tests: browser,
  },
  {
    name: 'the panel touches its trigger',
    edits: [
      { file: '../src/popover.ts', find: '  gap: 12,\n  padding: 8,', replace: '  padding: 8,' },
    ],
    tests: browser,
  },
  {
    name: 'the arrow stands centred, whatever the anchor computed',
    edits: [
      {
        file: '../src/recipes/popover.ts',
        find: "var(--arrow-${along === 'left' ? 'x' : 'y'}, ",
        replace: 'var(--arrow-none, ',
      },
    ],
    tests: browser,
  },
  {
    name: 'the arrow sits inside the panel’s edge',
    edits: [
      {
        file: '../src/recipes/popover.ts',
        find: '[edge]: `calc(${arrowSize} / -2 - ${ref.border.thin} / 2)`,',
        replace: '[edge]: `0px`,',
      },
    ],
    tests: browser,
  },
  {
    name: 'the popover’s arrow is the tooltip’s small one',
    edits: [{ file: '../src/recipes/popover.ts', find: 'size: ref.space.sm,', replace: '' }],
    tests: browser,
  },
]
