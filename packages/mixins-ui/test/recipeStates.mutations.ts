/**
 * The form recipes' state rules, deleted in turn:
 * `pnpm mutate packages/mixins-ui/test/recipeStates.mutations.ts`.
 */
const tests = ['packages/mixins-ui/test/recipeStates.browser.test.ts']

export default [
  {
    name: 'an outline Select shows no invalid edge',
    edits: [
      {
        file: '../src/recipes/select.ts',
        find: "Style.states({ true: { borderColor: ref.error.outline } }, 'aria-invalid'),",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a filled Select shows no invalid edge',
    edits: [
      {
        file: '../src/recipes/select.ts',
        find: `Style.pseudo('[aria-invalid="true"]', { borderColor: ref.error.outline }),`,
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a hovered filled Input keeps its resting fill',
    edits: [{ file: '../src/recipes/field.ts', find: '  filledHover,', replace: '' }],
    tests,
  },
  {
    name: 'a hovered filled Select keeps its resting fill',
    edits: [{ file: '../src/recipes/select.ts', find: '          filledHover,', replace: '' }],
    tests,
  },
  {
    name: 'a hovered filled Listbox trigger keeps its resting fill',
    edits: [{ file: '../src/recipes/listbox.ts', find: '    filledHover,', replace: '' }],
    tests,
  },
  {
    name: 'a pressed primary Button looks unpressed',
    edits: [
      {
        file: '../src/recipes/button.ts',
        find: '          on({ backgroundColor: primaryActive, borderColor: primaryActive }),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a disabled Segmented option is not dimmed',
    edits: [{ file: '../src/recipes/segmented.ts', find: '      disabled,', replace: '' }],
    tests,
  },
  {
    name: 'a disabled number field changes its edge under the pointer',
    edits: [
      {
        file: '../src/recipes/numberField.ts',
        find: ':hover:not(:focus-within, :has(> input:disabled))',
        replace: ':hover:not(:focus-within)',
      },
    ],
    tests,
  },
  {
    name: 'a hovered Input keeps its resting edge',
    edits: [
      {
        file: '../src/recipes/field.ts',
        find: "Style.pseudo(':hover:not(:focus, :disabled)', { borderColor: ref.outline.overt }),",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'an invalid OTP code does not redden its cells',
    edits: [
      {
        file: '../src/recipes/otpField.ts',
        find: "Style.pseudo('[data-invalid]', { borderColor: ref.error.outline }),",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a disabled OTP code is not dimmed',
    edits: [
      {
        file: '../src/recipes/otpField.ts',
        find: "Style.pseudo('[data-disabled]', { opacity: ref.knob['state-disabled'] }),",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'an invalid Combobox field keeps its resting edge',
    edits: [
      {
        file: '../src/recipes/combobox.ts',
        find: 'Style.pseudo(\':has([aria-invalid="true"])\', { borderColor: ref.error.outline }),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a number field draws no ring while it has focus',
    edits: [
      {
        file: '../src/recipes/numberField.ts',
        find: "Style.pseudo(':focus-within', {",
        replace: "Style.pseudo(':focus-withinX', {",
      },
    ],
    tests,
  },
  {
    name: 'an invalid radio group shows no error edge',
    edits: [
      {
        file: '../src/recipes/radio.ts',
        find: 'Style.nest(\'[aria-invalid="true"] &\', { borderColor: ref.error.outline }),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a checked checkbox looks unchecked',
    edits: [
      {
        file: '../src/recipes/toggle.ts',
        find: 'Style.pseudo(`:is(${checked}, [aria-checked="mixed"])`, {',
        replace: 'Style.pseudo(`:is(${checked}X, [aria-checked="mixed"]X)`, {',
      },
    ],
    tests,
  },
]
