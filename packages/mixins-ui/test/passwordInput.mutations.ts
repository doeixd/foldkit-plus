/**
 * The password input, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/passwordInput.mutations.ts` checks
 * that a test fails for every one.
 */
const unit = 'packages/mixins-ui/test/passwordInput.test.ts'
const browser = 'packages/mixins-ui/test/passwordInput.browser.test.ts'

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
        find: '...(options.description === undefined ? [] : [descriptionId]),',
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
        find: 'h.OnInput(options.onInput),',
        replace: 'h.OnInput(() => options.onInput(options.value)),',
      },
    ],
    tests: [unit],
  },
  {
    name: 'Caps Lock reads the case alone, Shift or not',
    edits: [
      {
        file: '../src/passwordInput.ts',
        find: 'Option.some((key === key.toUpperCase()) !== modifiers.shiftKey)',
        replace: 'Option.some(key === key.toUpperCase())',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a digit says Caps Lock is off',
    edits: [
      {
        file: '../src/passwordInput.ts',
        find: 'key.length === 1 && key.toLowerCase() !== key.toUpperCase()',
        replace: 'key.length === 1',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the input does not read the requirements',
    edits: [
      {
        file: '../src/passwordInput.ts',
        find: '...(requirements === undefined || requirements.length === 0 ? [] : [requirementsId]),',
        replace: '',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a requirement does not say whether it is met',
    edits: [
      {
        file: '../src/passwordInput.ts',
        find: '`, ${requirement.met ? states.met : states.unmet}`',
        replace: "''",
      },
    ],
    tests: [unit],
  },
  {
    name: 'the Caps Lock hint appears only as it speaks',
    edits: [
      {
        file: '../src/passwordInput.ts',
        find: "builders.capsLock.attrs([h.Id(capsLockId), h.Role('status')]),",
        replace:
          "builders.capsLock.attrs([h.Id(capsLockId), ...(capsOn ? [h.Role('status')] : [])]),",
      },
    ],
    tests: [unit],
  },
  {
    name: 'a met ring stays hollow',
    edits: [
      {
        file: '../src/recipes/passwordInput.ts',
        find: `Style.nest('&[data-met="true"]::before', { background: 'currentColor' }),`,
        replace: '',
      },
    ],
    tests: [browser],
  },
]
