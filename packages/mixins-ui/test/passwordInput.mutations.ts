/**
 * The password input, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/passwordInput.mutations.ts` checks
 * that a test fails for every one.
 */
const unit = 'packages/mixins-ui/test/passwordInput.test.ts'

export default [
  {
    name: 'the password shows while hidden',
    edits: [
      {
        file: '../src/passwordInput.ts',
        find: "h.Type(options.visible ? 'text' : 'password')",
        replace: "h.Type(options.visible ? 'password' : 'text')",
      },
    ],
    tests: [unit],
  },
  {
    name: 'the toggle reads pressed while the password hides',
    edits: [
      {
        file: '../src/passwordInput.ts',
        find: 'h.AriaPressed(String(options.visible))',
        replace: 'h.AriaPressed(String(!options.visible))',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the browser offers to make a new password by default',
    edits: [
      {
        file: '../src/passwordInput.ts',
        find: "options.autocomplete ?? 'current-password'",
        replace: "'new-password'",
      },
    ],
    tests: [unit],
  },
  {
    name: 'a shown password is spellchecked',
    edits: [{ file: '../src/passwordInput.ts', find: 'h.Spellcheck(false),', replace: '' }],
    tests: [unit],
  },
  {
    name: 'an invalid password is not said to be',
    edits: [
      {
        file: '../src/passwordInput.ts',
        find: '...(options.invalid === true ? [h.AriaInvalid(true)] : []),',
        replace: '',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the description does not describe the input',
    edits: [
      {
        file: '../src/passwordInput.ts',
        find: '...(options.description === undefined ? [] : [h.AriaDescribedBy(descriptionId)]),',
        replace: '',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a disabled toggle still toggles',
    edits: [
      {
        file: '../src/passwordInput.ts',
        find: '...(disabled ? [h.Disabled(true)] : [h.OnClick(options.onToggle)]),',
        replace: 'h.OnClick(options.onToggle),',
      },
    ],
    tests: [unit],
  },
  {
    name: 'typing sends the text the field had',
    edits: [
      {
        file: '../src/passwordInput.ts',
        find: '[h.OnInput(options.onInput)]',
        replace: '[h.OnInput(() => options.onInput(options.value))]',
      },
    ],
    tests: [unit],
  },
]
