/**
 * The overlay bars' wiring, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/overlayBars.mutations.ts` checks that
 * a test fails for every one.
 */
const tests = ['packages/mixins-ui/test/overlayBars.test.ts']

export default [
  {
    name: 'a Command runs its bars on its root',
    edits: [
      {
        file: '../src/command.ts',
        find: '      list: Behavior.slot({',
        replace: '      root: Behavior.slot({',
      },
    ],
    tests,
  },
  {
    name: 'a Command leaves its list unframed',
    edits: [{ file: '../src/command.ts', find: '    scrolling,', replace: '    list,' }],
    tests,
  },
  {
    name: "a VirtualList's bars look for no scroller",
    edits: [
      {
        file: '../src/virtualList.ts',
        find: "mount: () => ScrollBars({ scroller: ':scope > ul' }),",
        replace: 'mount: () => ScrollBars({}),',
      },
    ],
    tests,
  },
  {
    name: 'a menu runs no bars on its scroll region',
    edits: [
      {
        file: '../src/menu.ts',
        find: 'mount: () => ScrollBars({}),',
        replace: 'mount: () => FluidHover({ name: "x", item: "x", axis: "y", gapClick: false }),',
      },
    ],
    tests,
  },
  {
    name: 'a panel that does not scroll gets a bar',
    edits: [
      { file: '../src/popupScroll.ts', find: '  scrolls\n    ? {', replace: '  true\n    ? {' },
    ],
    tests,
  },
  {
    name: 'the bar is never drawn in the panel',
    edits: [
      {
        file: '../src/popupView.ts',
        find: ': [h.div(panel.scrollBar, [h.div(panel.scrollThumb ?? [], [])])]),',
        replace: ': []),',
      },
    ],
    tests,
  },
]
