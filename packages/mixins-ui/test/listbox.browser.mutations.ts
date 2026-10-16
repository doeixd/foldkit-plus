/**
 * The horizontal listbox in a real browser, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/listbox.browser.mutations.ts` checks
 * that the test fails.
 */
const tests = ['packages/mixins-ui/test/listbox.browser.test.ts']

export default [
  {
    name: 'a horizontal listbox reads the arrows physically right to left',
    edits: [
      {
        file: '../src/listboxShared.ts',
        find: 'h.OnKeyDownPreventDefault(key => handleItemsKeyDown(readingKey(key, direction))),',
        replace: 'h.OnKeyDownPreventDefault(handleItemsKeyDown),',
      },
    ],
    tests,
  },
  {
    name: 'the listbox drops the direction it is given',
    edits: [
      {
        file: '../src/listboxShared.ts',
        find: '    selectedValues,\n    direction,\n  } = viewInputs',
        replace: "    selectedValues,\n  } = viewInputs\n  const direction = 'ltr'",
      },
    ],
    tests,
  },
]
