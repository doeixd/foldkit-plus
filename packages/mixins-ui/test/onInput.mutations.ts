/**
 * A text field's `onInput` given as the builder's own attribute, and the
 * PasswordInput's added attributes, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/onInput.mutations.ts` checks that a
 * test fails for every one.
 */
const password = 'packages/mixins-ui/test/passwordInput.test.ts'
const input = 'packages/mixins-ui/test/inputView.test.ts'
const field = 'packages/mixins-ui/test/field.test.ts'

export default [
  {
    name: 'an attribute is called as a closure',
    edits: [
      {
        file: '../src/field.ts',
        find: "typeof onInput === 'function' ? h.OnInput(onInput) : onInput",
        replace: 'h.OnInput(onInput as (value: string) => Message)',
      },
    ],
    tests: [password, input],
  },
  {
    name: 'a closure is passed through unbound',
    edits: [
      {
        file: '../src/field.ts',
        find: "typeof onInput === 'function' ? h.OnInput(onInput) : onInput",
        replace: 'onInput as never',
      },
    ],
    tests: [password, field],
  },
  {
    name: 'the Input drops what typing sends',
    edits: [
      {
        file: '../src/input.ts',
        find: 'input: [...attributes.input, onInputOf(h, options.onInput)]',
        replace: 'input: attributes.input',
      },
    ],
    tests: [input, field],
  },
  {
    name: 'a disabled Input still sends what is typed',
    edits: [
      {
        file: '../src/input.ts',
        find: 'options.onInput === undefined || options.disabled === true',
        replace: 'options.onInput === undefined',
      },
    ],
    tests: [input],
  },
  {
    name: "the PasswordInput drops a Slot's added attributes",
    edits: [
      {
        file: '../src/passwordInput.ts',
        find: 'builders[slot].attrs([...base, ...(options.attributes?.[slot] ?? [])])',
        replace: 'builders[slot].attrs(base)',
      },
    ],
    tests: [password],
  },
  {
    name: "the PasswordInput's added attributes replace its own",
    edits: [
      {
        file: '../src/passwordInput.ts',
        find: 'builders[slot].attrs([...base, ...(options.attributes?.[slot] ?? [])])',
        replace: 'builders[slot].attrs(options.attributes?.[slot] ?? base)',
      },
    ],
    tests: [password],
  },
]
