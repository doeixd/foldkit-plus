/**
 * The one-time code, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/otpField.mutations.ts` checks that a
 * test fails for every one.
 */
const file = '../src/otpField.ts'
const recipe = '../src/recipes/otpField.ts'
const unit = 'packages/mixins-ui/test/otpField.test.ts'
const browser = 'packages/mixins-ui/test/otpField.browser.test.ts'

export default [
  {
    name: 'the name is not written',
    edits: [{ file, find: 'h.Name(options.name)', replace: 'h.Id("x")' }],
    tests: [unit],
  },
  {
    name: 'a read-only code still takes typing',
    edits: [{ file, find: ': options.readOnly === true', replace: ': false' }],
    tests: [unit],
  },
  {
    name: 'an invalid code marks no cell',
    edits: [
      {
        file,
        find: "...(options.invalid === true ? [h.DataAttribute('invalid', '')] : []),",
        replace: '',
      },
    ],
    tests: [unit],
  },
  {
    name: 'an invalid cell keeps its edge',
    edits: [
      {
        file: recipe,
        find: "Style.pseudo('[data-invalid]'",
        replace: "Style.pseudo('[data-never]'",
      },
    ],
    tests: [browser],
  },
  {
    name: 'a disabled cell looks live',
    edits: [
      {
        file: recipe,
        find: "Style.pseudo('[data-disabled]'",
        replace: "Style.pseudo('[data-never]'",
      },
    ],
    tests: [browser],
  },
  {
    name: 'a code keeps characters past its length',
    edits: [
      {
        file,
        find: "text.replace(PATTERNS[pattern], '').slice(0, length)",
        replace: "text.replace(PATTERNS[pattern], '')",
      },
    ],
    tests: [unit],
  },
  {
    name: 'what was typed is sent as typed',
    edits: [
      {
        file,
        find: 'h.OnInput(text => options.onChange(kept(text, length, pattern)))',
        replace: 'h.OnInput(text => options.onChange(text))',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the cell after the last filled one reads as filled',
    edits: [
      {
        file,
        find: "h.DataAttribute('filled', String(index < value.length)),",
        replace: "h.DataAttribute('filled', String(index <= value.length)),",
      },
    ],
    tests: [unit],
  },
  {
    name: 'a full code marks no cell for the caret',
    edits: [
      {
        file,
        find: 'index === Math.min(value.length, length - 1)',
        replace: 'index === value.length',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a phone offers its keyboard for digits',
    edits: [
      {
        file,
        find: "h.InputMode(pattern === 'digits' ? 'numeric' : 'text'),",
        replace: "h.InputMode('text'),",
      },
    ],
    tests: [unit],
  },
  {
    name: 'a disabled field still takes input',
    edits: [{ file, find: '...(options.disabled === true\n', replace: '...(false\n' }],
    tests: [unit],
  },
  {
    name: 'the cells catch a press meant for the input',
    edits: [
      {
        file: recipe,
        find: "Style.self({ display: 'flex', pointerEvents: 'none' })",
        replace: "Style.self({ display: 'flex' })",
      },
    ],
    tests: [browser],
  },
  {
    name: 'a masked field shows its characters',
    edits: [
      {
        file: '../src/otpField.ts',
        find: 'const shown = (char: string) => mark ?? char',
        replace: 'const shown = (char: string) => char',
      },
    ],
    tests: ['packages/mixins-ui/test/otpField.test.ts'],
  },
  {
    name: 'a masked field keeps its input readable',
    edits: [
      {
        file: '../src/otpField.ts',
        find: "h.Type(mark === undefined ? 'text' : 'password')",
        replace: "h.Type('text')",
      },
    ],
    tests: ['packages/mixins-ui/test/otpField.test.ts'],
  },
  {
    name: 'a mask of true is no mark',
    edits: [
      {
        file: '../src/otpField.ts',
        find: "options.mask === true ? '•'",
        replace: "options.mask === true ? '*'",
      },
    ],
    tests: ['packages/mixins-ui/test/otpField.test.ts'],
  },
]
