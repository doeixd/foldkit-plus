/**
 * The popups' size on the ladder, broken:
 * `pnpm mutate packages/mixins-ui/test/popupLadder.mutations.ts`.
 */
export default [
  {
    name: "a listbox's size stops at its wrapper",
    edits: [
      {
        file: '../src/recipes/listbox.ts',
        find: 'sm: { wrapper: steps.sm, items: steps.sm },',
        replace: 'sm: { wrapper: steps.sm },',
      },
    ],
    tests: ['packages/mixins-ui/test/popupLadder.browser.test.ts'],
  },
]
