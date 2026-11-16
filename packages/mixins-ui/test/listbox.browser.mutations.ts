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
  {
    name: 'the listbox draws no direction of its own',
    edits: [
      {
        file: '../src/listboxShared.ts',
        find: `      // So the CSS reads the direction the keys do.
      ...(direction === undefined ? [] : [h.Dir(direction)]),`,
        replace: '',
      },
    ],
    tests: [...tests, 'packages/mixins-ui/test/popupStates.browser.test.ts'],
  },
  {
    name: 'a key moves from the item the last drawing showed, not from where the previous key left off',
    edits: [
      {
        file: '../src/listboxShared.ts',
        find: '    reached = { ...reached, activeIndex: Option.some(targetIndex) }\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'type-ahead refines the query the last drawing held',
    edits: [
      {
        file: '../src/listboxShared.ts',
        find: '      searchQuery: nextQuery,\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a key after type-ahead moves from the item the last drawing showed',
    edits: [
      {
        file: '../src/listboxShared.ts',
        find: '      activeIndex: Option.orElse(maybeTargetIndex, () => reached.activeIndex),\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a closed listbox opened by a key is still closed for the next key of its drawing',
    edits: [
      {
        file: '../src/listboxShared.ts',
        find: '    reached = { ...reached, isOpen: true, activeIndex: maybeIndex }\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'Enter chooses the item the last drawing showed active',
    edits: [
      {
        file: '../src/listboxShared.ts',
        find: 'return Option.map(reached.activeIndex, index => Message.RequestedItemClick({ index }))',
        replace:
          'return Option.map(maybeActiveItemIndex, index => Message.RequestedItemClick({ index }))',
      },
    ],
    tests,
  },
  {
    name: 'Space after letters reads the query the last drawing held',
    edits: [
      {
        file: '../src/listboxShared.ts',
        find: "String.isNonEmpty(reached.searchQuery) ? searchForKey(' ') : resolveCommitMessage(),",
        replace: "String.isNonEmpty(searchQuery) ? searchForKey(' ') : resolveCommitMessage(),",
      },
    ],
    tests,
  },
]
