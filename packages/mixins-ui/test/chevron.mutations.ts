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
    name: "the sidebar's chevron is not the shared one's size",
    edits: [
      {
        file: '../src/recipes/sidebar.ts',
        find: "turningChevron(open, '0.4em')",
        replace: "turningChevron(open, '0.5em')",
      },
    ],
    tests: [browser],
  },
  {
    name: "the shared chevron (the accordion's) has no right to left turn",
    edits: [
      {
        file: '../src/recipes/design.ts',
        find: "    Style.nest('&:where(:dir(rtl))', { rotate: '135deg' }),\n",
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the shared chevron, open right to left, points along the row',
    edits: [
      {
        file: '../src/recipes/design.ts',
        find: "    Style.nest(`:where(${open}) > &:where(:dir(rtl))`, { rotate: '45deg' }),\n",
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: "the tree's chevron opens with its row, not with the item above it",
    edits: [
      {
        file: '../src/recipes/treeView.ts',
        find: 'turningChevron(\'[aria-expanded="true"] > *\', chevronSize)',
        replace: 'turningChevron(\'[aria-expanded="true"]\', chevronSize)',
      },
    ],
    tests: [browser],
  },
  {
    name: "a submenu row's chevron has no right to left turn",
    edits: [
      {
        file: '../src/recipes/menu.ts',
        find: "      Style.pseudo(':dir(rtl)', { rotate: '135deg' }),\n",
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
  {
    name: 'the shared chevron turns under any right-to-left ancestor',
    edits: [
      {
        file: '../src/recipes/design.ts',
        find: "    Style.nest('&:where(:dir(rtl))', { rotate: '135deg' }),",
        replace: "    Style.nest(':where([dir=\"rtl\"]) &', { rotate: '135deg' }),",
      },
    ],
    tests: [browser],
  },
  {
    name: "a trigger's chevron is not nudged back onto the line",
    edits: [
      {
        file: '../src/recipes/design.ts',
        find: "      blockSize: size,\n      marginBlockStart: '-0.2em',\n",
        replace: '      blockSize: size,\n',
      },
    ],
    tests: [browser],
  },
  {
    name: "a trigger's chevron does not turn open",
    edits: [
      {
        file: '../src/recipes/design.ts',
        find: "{ rotate: '225deg', marginBlockStart: '0.2em' }",
        replace: "{ marginBlockStart: '0.2em' }",
      },
    ],
    tests: [browser],
  },
  {
    name: "the listbox's chevron opens only as the trigger's child",
    edits: [
      {
        file: '../src/recipes/listbox.ts',
        find: `triggerChevron(':where([aria-expanded="true"]) &'`,
        replace: `triggerChevron(':where([aria-expanded="true"]) > &'`,
      },
    ],
    tests: [browser],
  },
  {
    name: "the cascade select's chevron opens only as the trigger's child",
    edits: [
      {
        file: '../src/recipes/cascadeSelect.ts',
        find: `triggerChevron(':where([aria-expanded="true"]) &'`,
        replace: `triggerChevron(':where([aria-expanded="true"]) > &'`,
      },
    ],
    tests: [browser],
  },
  {
    name: "the nav's chevron opens on a state its trigger does not write",
    edits: [
      {
        file: '../src/recipes/nav.ts',
        find: `triggerChevron(':where([data-state="open"]) > &'`,
        replace: `triggerChevron(':where([data-open]) > &'`,
      },
    ],
    tests: [browser],
  },
]
