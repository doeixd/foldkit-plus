/**
 * Navigation keys the page is told were handled, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/navigationKeysPrevented.mutations.ts`. The tab list's keys
 * are upstream's, so no line here breaks them.
 */
const tests = ['packages/mixins-ui/test/navigationKeysPrevented.browser.test.ts']

export default [
  {
    name: 'a tree leaves End to the page',
    edits: [
      {
        file: '../src/treeView.ts',
        find: "'ArrowRight', 'Home', 'End', 'Enter'])",
        replace: "'ArrowRight', 'Home', 'Enter'])",
      },
    ],
    tests,
  },
  {
    name: 'an open listbox handles no key',
    edits: [
      {
        file: '../src/listboxShared.ts',
        find: 'h.OnKeyDownPreventDefault(key => handleItemsKeyDown(readingKey(key, direction))),',
        replace: 'h.OnKeyDownPreventDefault(() => Option.none()),',
      },
    ],
    tests,
  },
]
