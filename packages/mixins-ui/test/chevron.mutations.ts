/**
 * The drawn chevrons and checks, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/chevron.mutations.ts` checks that a
 * test fails for every one.
 */
const browser = 'packages/mixins-ui/test/chevron.browser.test.ts'

export default [
  {
    name: 'the sides are logical, so right to left mirrors the mark',
    edits: [
      {
        file: '../src/recipes/design.ts',
        find: 'borderRight: `${width} solid ${color}`,\n  borderBottom:',
        replace: 'borderInlineEnd: `${width} solid ${color}`,\n  borderBlockEnd:',
      },
    ],
    tests: [browser],
  },
  {
    name: "the sidebar's chevron has no right to left turn",
    edits: [
      {
        file: '../src/recipes/sidebar.ts',
        find: "      Style.nest(':where([dir=\"rtl\"]) &', { rotate: '135deg' }),\n",
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: "the sidebar's right to left turn beats its open one",
    edits: [
      {
        file: '../src/recipes/sidebar.ts',
        find: "      Style.nest(':where([dir=\"rtl\"]) &', { rotate: '135deg' }),\n      Style.nest(`:where(${open}) > &`, { rotate: '45deg' }),",
        replace:
          "      Style.nest(`:where(${open}) > &`, { rotate: '45deg' }),\n      Style.nest(':where([dir=\"rtl\"]) &', { rotate: '135deg' }),",
      },
    ],
    tests: [browser],
  },
  {
    name: "the accordion's chevron has no right to left turn",
    edits: [
      {
        file: '../src/recipes/accordion.ts',
        find: "      Style.nest(':where([dir=\"rtl\"]) &', { rotate: '135deg' }),\n",
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: "the tree's chevron has no right to left turn",
    edits: [
      {
        file: '../src/recipes/treeView.ts',
        find: "      Style.nest(':where([dir=\"rtl\"]) &', { rotate: '135deg' }),\n",
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: "a submenu row's chevron has no right to left turn",
    edits: [
      {
        file: '../src/recipes/menu.ts',
        find: "      Style.nest(':where([dir=\"rtl\"]) &', { rotate: '135deg' }),\n",
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the carousel arrows do not flip right to left',
    edits: [
      {
        file: '../src/recipes/carousel.ts',
        find: "    Style.pseudo(':dir(rtl)', { scale: '-1 1' }),\n",
        replace: '',
      },
    ],
    tests: [browser],
  },
]
