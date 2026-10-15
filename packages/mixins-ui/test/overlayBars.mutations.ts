/**
 * The overlay bars' wiring, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/overlayBars.mutations.ts` checks that
 * a test fails for every one.
 */
const tests = ['packages/mixins-ui/test/overlayBars.test.ts']

export default [
  {
    name: 'a Command runs no bars on its list',
    edits: [
      {
        file: '../src/command.ts',
        find: '      ...(overlay ? [h.OnMount(ScrollBars({}))] : []),\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a Command with bars leaves its list unframed',
    edits: [
      {
        file: '../src/command.ts',
        find: '  const scrolling = overlay\n',
        replace: '  const scrolling = false\n',
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
