/**
 * The Listbox trigger's and the Combobox field's states, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/popupStates.mutations.ts` checks that
 * a test fails for every one.
 */
const tests = ['packages/mixins-ui/test/popupStates.browser.test.ts']

export default [
  {
    name: 'a Listbox trigger is not announced invalid',
    edits: [
      {
        file: '../src/listboxShared.ts',
        find: "...(isInvalid ? [h.AriaInvalid(true), h.DataAttribute('invalid', '')] : []),\n      ...(buttonClassName",
        replace:
          "...(isInvalid ? [h.DataAttribute('invalid', '')] : []),\n      ...(buttonClassName",
      },
    ],
    tests,
  },
  {
    name: 'the outline Listbox trigger draws no error edge',
    edits: [
      {
        file: '../src/recipes/listbox.ts',
        find: '  invalidEdge,\n  focusRing,',
        replace: '  focusRing,',
      },
    ],
    tests,
  },
  {
    name: 'the filled Listbox trigger hides its error edge',
    edits: [
      {
        file: '../src/recipes/listbox.ts',
        find: "    Style.self({ background: ref.surface.field, borderColor: 'transparent' }),\n    invalidEdge,",
        replace: "    Style.self({ background: ref.surface.field, borderColor: 'transparent' }),",
      },
    ],
    tests,
  },
  {
    name: 'the ghost Listbox trigger hides its error edge',
    edits: [
      {
        file: '../src/recipes/listbox.ts',
        find: "    hover({ background: unfilledHover, borderColor: 'transparent' }),\n    invalidEdge,",
        replace: "    hover({ background: unfilledHover, borderColor: 'transparent' }),",
      },
    ],
    tests,
  },
  {
    name: 'a disabled Listbox trigger shows hover',
    edits: [
      {
        file: '../src/recipes/listbox.ts',
        find: ':hover:not(:focus, [aria-invalid="true"], :is([aria-disabled="true"], :disabled))',
        replace: ':hover:not(:focus, [aria-invalid="true"], :disabled)',
      },
    ],
    tests,
  },
  {
    name: 'an invalid Listbox trigger loses its error edge under the pointer',
    edits: [
      {
        file: '../src/recipes/listbox.ts',
        find: ':hover:not(:focus, [aria-invalid="true"], :is([aria-disabled="true"], :disabled))',
        replace: ':hover:not(:focus, :is([aria-disabled="true"], :disabled))',
      },
    ],
    tests,
  },
  {
    name: 'an invalid Combobox field draws no error edge',
    edits: [
      {
        file: '../src/recipes/combobox.ts',
        find: '      Style.pseudo(\':has([aria-invalid="true"])\', { borderColor: ref.error.outline }),\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a disabled Combobox field shows hover',
    edits: [
      {
        file: '../src/recipes/combobox.ts',
        find: ':hover:not(:focus-within, :has(:disabled, [aria-disabled="true"], [aria-invalid="true"]))',
        replace: ':hover:not(:focus-within, :has([aria-invalid="true"]))',
      },
    ],
    tests,
  },
  {
    name: 'an invalid Combobox field loses its error edge under the pointer',
    edits: [
      {
        file: '../src/recipes/combobox.ts',
        find: ':hover:not(:focus-within, :has(:disabled, [aria-disabled="true"], [aria-invalid="true"]))',
        replace: ':hover:not(:focus-within, :has(:disabled, [aria-disabled="true"]))',
      },
    ],
    tests,
  },
  {
    name: 'the Combobox has no large size',
    edits: [
      {
        file: '../src/recipes/combobox.ts',
        find: '      lg: { wrapper: steps.lg, items: steps.lg, empty: steps.lg },\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the clear button ignores the touch floor',
    edits: [
      {
        file: '../src/recipes/combobox.ts',
        find: "const clearSize = 'max(1.5em, var(--fk-touch-floor, 0px))'",
        replace: "const clearSize = '1.5em'",
      },
    ],
    tests,
  },
  {
    name: 'the list takes Home and End from the text',
    edits: [
      {
        file: '../src/comboboxShared.ts',
        find: "      // Home and End are the text's: the APG has an editable combobox keep them\n      // in the textbox, moving the caret, where the list's ends are optional.\n",
        replace:
          "      Match.whenOr('Home', 'End', () => Option.some(Message.SuppressedEmptyItemNavigation())),\n",
      },
    ],
    tests,
  },
]
