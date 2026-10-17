/**
 * The Combobox's own parts, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/comboboxParts.mutations.ts` checks
 * that a test fails for every one.
 */
const unit = 'packages/mixins-ui/test/comboboxParts.test.ts'
const view = 'packages/mixins-ui/test/comboboxView.test.ts'
const browser = 'packages/mixins-ui/test/comboboxParts.browser.test.ts'

export default [
  {
    name: 'a match is marked in its case alone',
    edits: [
      {
        file: '../src/listbox.ts',
        find: 'const hay = label.toLowerCase()',
        replace: 'const hay = label',
      },
    ],
    tests: [unit],
  },
  {
    name: 'only the first match is marked',
    edits: [
      {
        file: '../src/listbox.ts',
        find: 'at = hay.indexOf(needle, from)',
        replace: 'at = -1',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the typed text is not trimmed',
    edits: [
      {
        file: '../src/listbox.ts',
        find: 'const needle = query.trim().toLowerCase()',
        replace: 'const needle = query.toLowerCase()',
      },
    ],
    tests: [unit],
  },
  {
    name: 'chips are drawn unasked',
    edits: [
      {
        file: '../src/comboboxShared.ts',
        find: 'chips === undefined\n      ? []',
        replace: 'false\n      ? []',
      },
    ],
    tests: [view],
  },
  {
    name: "a chip's remove sends nothing",
    edits: [
      {
        file: '../src/comboboxShared.ts',
        find: 'Message.SelectedItem({ item: value, displayText: label, wasSelected: true }),',
        replace: 'Message.DeactivatedItem(),',
      },
    ],
    tests: [view, browser],
  },
  {
    name: "a disabled field's chips still remove",
    edits: [
      {
        file: '../src/comboboxShared.ts',
        find: '...(isDisabled || isReadOnly\n                ? [h.Disabled(true)]',
        replace: '...(false\n                ? [h.Disabled(true)]',
      },
    ],
    tests: [view],
  },
  {
    name: 'the clear button shows on an empty field',
    edits: [
      {
        file: '../src/comboboxShared.ts',
        find: "clearContent === undefined || model.inputValue === '' ||",
        replace: 'clearContent === undefined ||',
      },
    ],
    tests: [view, browser],
  },
  {
    name: 'the clear button takes the focus',
    edits: [
      {
        file: '../src/comboboxShared.ts',
        find: "h.OnClick(Message.UpdatedInputValue({ value: '' })),\n            // The field keeps the focus, as with the toggle.\n            h.OnMount(UpstreamCombobox.AttachComboboxPreventBlur()),",
        replace: "h.OnClick(Message.UpdatedInputValue({ value: '' })),",
      },
    ],
    tests: [browser],
  },
  {
    name: 'the empty panel shows beside items',
    edits: [
      {
        file: '../src/comboboxShared.ts',
        find: 'isVisible && !isItemsPanelVisible && empty !== undefined',
        replace: 'isVisible && empty !== undefined',
      },
    ],
    tests: [view],
  },
  {
    name: 'the empty panel is not in the top layer',
    edits: [
      {
        file: '../src/comboboxShared.ts',
        find: "h.Role('status'),\n            ...anchorAttributes,",
        replace: "h.Role('status'),",
      },
    ],
    tests: [browser],
  },
  {
    name: 'the chips sit outside the field',
    edits: [
      {
        file: '../src/combobox.ts',
        find: 'if (chips === undefined && clearButton === undefined) return plain',
        replace: 'if (true) return plain',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the empty panel is not drawn',
    edits: [
      {
        file: '../src/combobox.ts',
        find: 'hiddenInputs: [\n        ...resolved.hiddenInputs,',
        replace: 'hiddenInputs: [\n        ...resolved.hiddenInputs, ...[],',
      },
      {
        file: '../src/combobox.ts',
        find: ": [h.keyed('div')(empty.key, empty.attributes, [empty.content])]),",
        replace: ': []),',
      },
    ],
    tests: [browser],
  },
]
