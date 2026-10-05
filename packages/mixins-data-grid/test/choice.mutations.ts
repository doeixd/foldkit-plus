/**
 * The choice list, each guard broken in turn: `pnpm mutate
 * packages/mixins-data-grid/test/choice.mutations.ts` checks that a test fails for every one.
 */
const tests = ['packages/mixins-data-grid/test/choice.browser.test.ts']

export default [
  {
    name: 'a press on the list takes focus from the combobox',
    edits: [{ file: '../src/view.ts', find: 'h.OnMount(KeepFocus()),', replace: '' }],
    tests,
  },
  {
    name: 'the list never opens upward',
    edits: [
      {
        file: '../src/view.ts',
        find: 'viewport.height - (top + rowHeight) < listHeight && top - headerHeight >= listHeight',
        replace: 'false',
      },
    ],
    tests,
  },
  {
    name: 'a letter on a choice is typed, not found',
    edits: [
      {
        file: '../../data-grid/src/grid.ts',
        find: 'onSome: choices => typedOption(choices, draft, text),',
        replace: 'onSome: () => draft + text,',
      },
    ],
    tests: ['packages/data-grid/test/grid.test.ts', ...tests],
  },
]
