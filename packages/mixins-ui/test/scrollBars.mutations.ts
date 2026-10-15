/**
 * The overlay scroll bar's look, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/scrollBars.mutations.ts` checks that
 * a test fails for every one.
 */
const tests = ['packages/mixins-ui/test/scrollBars.browser.test.ts']
const file = '../src/recipes/scrollBars.ts'

export default [
  {
    name: 'the thumb rests as wide as it is hovered',
    edits: [{ file, find: "const rest = '4px'", replace: "const rest = '6px'" }],
    tests,
  },
  {
    name: 'the thumb never widens',
    edits: [{ file, find: "const wide = '6px'", replace: "const wide = '4px'" }],
    tests,
  },
  {
    name: 'the thumb lies on the edge',
    edits: [{ file, find: "const inset = '2px'", replace: "const inset = '0px'" }],
    tests,
  },
  {
    name: 'the widening travels under reduced motion',
    edits: [
      {
        file,
        find: "    transitionProperty: 'inline-size, background-color',\n    transitionDuration: `${travelled(ref.motion.fast)}, ${ref.motion.fast}`,",
        replace:
          "    transitionProperty: 'inline-size, background-color',\n    transitionDuration: `${ref.motion.fast}, ${ref.motion.fast}`,",
      },
    ],
    tests,
  },
  {
    name: 'the browser bar stays beside the overlay',
    edits: [
      {
        file,
        find: "  Style.pseudo('[data-scroll-overlaid]', { scrollbarWidth: 'none' }),\n",
        replace: '',
      },
    ],
    tests: [...tests, 'packages/mixins-ui/test/scrollArea.test.ts'],
  },
  {
    name: 'a shown bar stays unseen',
    edits: [
      {
        file,
        find: "  Style.pseudo('[data-shown]', {\n    opacity: '1',",
        replace: "  Style.pseudo('[data-shown]', {\n    opacity: '0',",
      },
    ],
    tests,
  },
  {
    name: 'a bar with nothing to scroll is drawn',
    edits: [
      {
        file,
        find: "    display: 'none',\n    zIndex: '1',",
        replace: "    display: 'block',\n    zIndex: '1',",
      },
    ],
    tests,
  },
]
