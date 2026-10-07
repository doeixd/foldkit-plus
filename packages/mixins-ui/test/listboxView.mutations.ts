/**
 * The forked listbox views, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/listboxView.mutations.ts` checks that
 * a test fails for every one. The parity battery draws all three views over
 * the same models, so a fork-only change that keeps the adapter compiling
 * must still fail here.
 */
const tests = ['packages/mixins-ui/test/listboxView.test.ts']

export default [
  {
    name: 'the button reports the inverted open state',
    edits: [
      {
        file: '../src/listboxShared.ts',
        find: 'h.AriaExpanded(isVisible),',
        replace: 'h.AriaExpanded(!isVisible),',
      },
    ],
    tests,
  },
  {
    name: 'the panel is a menu',
    edits: [
      {
        file: '../src/listboxShared.ts',
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
        file: '../src/listboxShared.ts',
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
        file: '../src/listboxShared.ts',
        find: 'h.AriaSelected(isSelectedItem),',
        replace: 'h.AriaSelected(!isSelectedItem),',
      },
    ],
    tests,
  },
  {
    name: 'items carry no click message',
    edits: [
      {
        file: '../src/listboxShared.ts',
        find: '? [h.OnClick(Message.SelectedItem({ item: itemToValue(item) }))]',
        replace: '? []',
      },
    ],
    tests,
  },
  {
    name: 'hidden inputs submit nothing',
    edits: [
      {
        file: '../src/listboxShared.ts',
        find: '? Array.match(selectedValues, {',
        replace: '? Array.match([], {',
      },
    ],
    tests,
  },
  {
    name: 'multi panels hide their multiselectability',
    edits: [
      {
        file: '../src/listboxShared.ts',
        find: '...(behavior.ariaMultiSelectable ? [h.AriaMultiSelectable(true)] : []),',
        replace: '...([]),',
      },
    ],
    tests,
  },
]
