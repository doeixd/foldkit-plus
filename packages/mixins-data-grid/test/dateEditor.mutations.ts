/**
 * The date editor's focus, its guard removed: `pnpm mutate
 * packages/mixins-data-grid/test/dateEditor.mutations.ts`.
 */
export default [
  {
    name: 'the caret is placed in a date input, which throws',
    edits: [
      {
        file: '../src/holdFocus.ts',
        find: "if (typeof editor.selectionStart === 'number') {",
        replace: 'if (true) {',
      },
    ],
    tests: ['packages/mixins-data-grid/test/dateEditor.browser.test.ts'],
  },
]
