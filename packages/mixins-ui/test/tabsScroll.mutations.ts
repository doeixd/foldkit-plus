/**
 * A scrolling Tabs row's bar and rule, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/tabsScroll.mutations.ts`.
 */
const browser = ['packages/mixins-ui/test/tabs.browser.test.ts']
const file = '../src/recipes/tabs.ts'

export default [
  {
    name: 'a line row draws its rule at the border, under a bar',
    edits: [
      {
        file,
        find: "backgroundPosition: 'bottom',",
        replace: 'boxShadow: `inset 0 calc(-1 * ${ref.border.thin}) 0 ${ref.outline.default}`,',
      },
    ],
    tests: browser,
  },
  {
    name: 'a scrolling row shows its thumb at rest',
    edits: [
      {
        file,
        find: "scrollbarColor: 'transparent transparent'",
        replace: "scrollbarColor: 'auto'",
      },
    ],
    tests: browser,
  },
  {
    name: 'a hovered row keeps its thumb hidden',
    edits: [{ file, find: "':is(:hover, :focus-within)'", replace: "':is(.never)'" }],
    tests: browser,
  },
]
