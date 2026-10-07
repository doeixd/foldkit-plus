/**
 * The forked combobox views, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/comboboxView.mutations.ts` checks that
 * a test fails for every one. The parity battery draws all three views over
 * the same models, so a fork-only change that keeps the adapter compiling
 * must still fail here.
 */
const tests = ['packages/mixins-ui/test/comboboxView.test.ts']

export default [
  {
    name: 'the input reports the inverted panel state',
    edits: [
      {
        file: '../src/comboboxShared.ts',
        find: "h.Role('combobox'),\n    h.AriaExpanded(isItemsPanelVisible),",
        replace: "h.Role('combobox'),\n    h.AriaExpanded(!isItemsPanelVisible),",
      },
    ],
    tests,
  },
  {
    name: 'the panel is a menu',
    edits: [
      {
        file: '../src/comboboxShared.ts',
        find: "h.Role('listbox'),",
        replace: "h.Role('menu'),",
      },
    ],
    tests,
  },
  {
    name: 'options lose their role',
    edits: [
      {
        file: '../src/comboboxShared.ts',
        find: "h.Role('option'),",
        replace: "h.Role('menuitem'),",
      },
    ],
    tests,
  },
  {
    name: 'selection reports inverted',
    edits: [
      {
        file: '../src/comboboxShared.ts',
        find: 'h.AriaSelected(isSelectedItem),',
        replace: 'h.AriaSelected(!isSelectedItem),',
      },
    ],
    tests,
  },
  {
    name: 'items are never clickable',
    edits: [
      {
        file: '../src/comboboxShared.ts',
        find: 'const isClickable = isHoverable && !isReadOnly',
        replace: 'const isClickable = false',
      },
    ],
    tests,
  },
  {
    name: 'the input never shows its value',
    edits: [
      {
        file: '../src/comboboxShared.ts',
        find: 'h.Value(model.inputValue),',
        replace: "h.Value(''),",
      },
    ],
    tests,
  },
  {
    name: 'the toggle button never draws',
    edits: [
      {
        file: '../src/comboboxShared.ts',
        find: 'const toggleButton =\n    buttonContent === undefined',
        replace: 'const toggleButton =\n    buttonContent === undefined || true',
      },
    ],
    tests,
  },
]
