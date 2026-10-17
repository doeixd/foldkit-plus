/**
 * Command's and VirtualList's scrolling on a real page, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/lists.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = ['packages/mixins-ui/test/lists.browser.test.ts']

export default [
  {
    name: "a Command's bars run on its root, which does not scroll",
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
    name: "a VirtualList's bars take its root for the scroller",
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
    name: "a VirtualList keeps the browser's bar beside its own",
    edits: [{ file: '../src/recipes/virtualList.ts', find: '      overlaidChild,\n', replace: '' }],
    tests,
  },
  {
    name: "a Command keeps the browser's bar beside its own",
    edits: [{ file: '../src/recipes/command.ts', find: '      overlaid,\n', replace: '' }],
    tests,
  },
  {
    name: 'the thumb stays at the top as the list scrolls',
    edits: [
      {
        file: '../src/recipes/scrollBars.ts',
        find: "translate: '0 var(--fk-scroll-thumb-offset, 0px)',",
        replace: "translate: '0 0',",
      },
    ],
    tests,
  },
  {
    name: 'a coarse pointer gets the overlay',
    edits: [
      {
        file: '../../primitives/src/dom/scroll-bars.ts',
        find: "if (typeof matchMedia !== 'function' || !matchMedia(FINE_POINTER).matches) {",
        replace: "if (typeof matchMedia !== 'function') {",
      },
    ],
    tests,
  },
  {
    name: 'a VirtualList takes its width from the rows drawn',
    edits: [
      {
        file: '../src/recipes/virtualList.ts',
        find: "          contain: 'inline-size',\n",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a VirtualList offers no width of its own',
    edits: [
      {
        file: '../src/recipes/virtualList.ts',
        find: "          containIntrinsicInlineSize: '20rem',\n",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: "a Command's shortcut follows the row's direction",
    edits: [
      {
        file: '../src/recipes/command.ts',
        find: "Style.nest('& > *', { direction: 'ltr', unicodeBidi: 'isolate' }),",
        replace: '',
      },
    ],
    tests,
  },
]
