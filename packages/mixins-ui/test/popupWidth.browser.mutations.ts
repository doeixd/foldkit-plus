/**
 * The popups' trigger width, broken:
 * `pnpm mutate packages/mixins-ui/test/popupWidth.browser.mutations.ts`
 * checks that the test fails.
 */
export default [
  {
    name: 'the trigger width is a base, which a later base beats',
    edits: [
      {
        file: '../src/recipes/popup.ts',
        find: 'export const triggerWidth: StyleValue = variant(',
        replace: 'export const triggerWidth: StyleValue = component(',
      },
    ],
    tests: ['packages/mixins-ui/test/popupWidth.browser.test.ts'],
  },
]
