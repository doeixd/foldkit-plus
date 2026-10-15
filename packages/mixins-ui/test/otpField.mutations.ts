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
]
