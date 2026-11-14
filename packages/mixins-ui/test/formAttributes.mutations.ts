/**
 * What Input.view and Textarea.view write for a form, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/formAttributes.mutations.ts`.
 */
const input = '../src/input.ts'
const textarea = '../src/textarea.ts'
const unit = [
  'packages/mixins-ui/test/inputView.test.ts',
  'packages/mixins-ui/test/textareaView.test.ts',
]

export default [
  {
    name: 'an input drops its name',
    edits: [
      {
        file: input,
        find: '...(options.name === undefined ? {} : { name: options.name }),',
        replace: '',
      },
    ],
    tests: unit,
  },
  {
    name: 'a read-only input still handles typing',
    edits: [{ file: input, find: 'options.readOnly === true\n', replace: 'false\n' }],
    tests: unit,
  },
  {
    name: 'an input is not required',
    edits: [
      {
        file: input,
        find: '...(options.required === true ? [h.Required(true), h.AriaRequired(true)] : []),',
        replace: '',
      },
    ],
    tests: unit,
  },
  {
    name: 'an input is not announced as required',
    edits: [
      { file: input, find: 'h.Required(true), h.AriaRequired(true)', replace: 'h.Required(true)' },
    ],
    tests: unit,
  },
  {
    name: 'an input drops its handed attributes',
    edits: [{ file: input, find: '...(options.attributes?.input ?? []),', replace: '' }],
    tests: unit,
  },
  {
    name: 'an input drops its label attributes',
    edits: [
      {
        file: input,
        find: 'label: [...attributes.label, ...(options.attributes?.label ?? [])],',
        replace: 'label: attributes.label,',
      },
    ],
    tests: unit,
  },
  {
    name: 'an input drops its input mode',
    edits: [
      {
        file: input,
        find: '...(options.inputMode === undefined ? [] : [h.InputMode(options.inputMode)]),',
        replace: '',
      },
    ],
    tests: unit,
  },
  {
    name: 'an input drops its maximum length',
    edits: [
      {
        file: input,
        find: '...(options.maxLength === undefined ? [] : [h.Maxlength(options.maxLength)]),',
        replace: '',
      },
    ],
    tests: unit,
  },
  {
    name: 'a textarea is not required',
    edits: [
      {
        file: textarea,
        find: '...(options.required === true ? [h.Required(true), h.AriaRequired(true)] : []),',
        replace: '',
      },
    ],
    tests: unit,
  },
  {
    name: 'a textarea drops its handed attributes',
    edits: [{ file: textarea, find: '...(options.attributes?.textarea ?? []),', replace: '' }],
    tests: unit,
  },
  {
    name: 'a password input drops its name',
    edits: [
      {
        file: '../src/passwordInput.ts',
        find: '...(options.name === undefined ? [] : [h.Name(options.name)]),',
        replace: '',
      },
    ],
    tests: ['packages/mixins-ui/test/passwordInput.test.ts'],
  },
  {
    name: 'a password input is not required',
    edits: [
      {
        file: '../src/passwordInput.ts',
        find: '...(options.required === true ? [h.Required(true), h.AriaRequired(true)] : []),',
        replace: '',
      },
    ],
    tests: ['packages/mixins-ui/test/passwordInput.test.ts'],
  },
  {
    name: 'a number field drops its name',
    edits: [
      {
        file: '../src/numberField.ts',
        find: '...(options.name === undefined ? [] : [h.Name(options.name)]),',
        replace: '',
      },
    ],
    tests: ['packages/mixins-ui/test/numberField.test.ts'],
  },
  {
    name: 'a number field is not required',
    edits: [
      {
        file: '../src/numberField.ts',
        find: '...(options.required === true ? [h.Required(true), h.AriaRequired(true)] : []),',
        replace: '',
      },
    ],
    tests: ['packages/mixins-ui/test/numberField.test.ts'],
  },
]
