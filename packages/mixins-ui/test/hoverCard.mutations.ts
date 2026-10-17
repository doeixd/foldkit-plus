/**
 * The hover card's panel, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/hoverCard.mutations.ts` checks that a
 * test fails for every one.
 */
const browser = ['packages/mixins-ui/test/hoverCard.browser.test.ts']

export default [
  {
    name: 'the anchored card stands in the flow beside its trigger',
    edits: [
      {
        file: '../src/hoverIntent.ts',
        find: "h.Style({ position: 'absolute', margin: '0',",
        replace: "h.Style({ margin: '0',",
      },
    ],
    tests: browser,
  },
  {
    name: 'the anchored card stays out of the top layer',
    edits: [
      {
        file: '../src/hoverIntent.ts',
        find: "      h.Attribute('popover', 'manual'),\n",
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'the anchor is not told of the arrow',
    edits: [
      {
        file: '../src/hoverIntent.ts',
        find: 'anchor: anchor(anchored.anchor), arrowId }',
        replace: 'anchor: anchor(anchored.anchor) }',
      },
    ],
    tests: browser,
  },
  {
    name: 'the anchored card touches its trigger',
    edits: [{ file: '../src/hoverIntent.ts', find: '  gap: 8,\n', replace: '' }],
    tests: browser,
  },
  {
    name: 'the card scrolls and clips its arrow',
    edits: [
      { file: '../src/recipes/hoverCard.ts', find: "        overflow: 'visible',\n", replace: '' },
    ],
    tests: browser,
  },
]
