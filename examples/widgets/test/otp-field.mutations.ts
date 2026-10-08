/**
 * The otp-field example, broken in turn:
 * `pnpm mutate examples/widgets/test/otp-field.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = ['examples/widgets/test/otp-field.test.ts']

export default [
  {
    name: 'typing takes the first character',
    edits: [
      {
        file: '../src/otp-field/app.ts',
        find: 'const char = message.char.slice(-1)',
        replace: 'const char = message.char.slice(0, 1)',
      },
    ],
    tests,
  },
  {
    name: 'Backspace clears the focused cell instead',
    edits: [
      {
        file: '../src/otp-field/view.ts',
        find: 'message: Message.CellCleared({ index: index - 1 }),',
        replace: 'message: Message.CellCleared({ index }),',
      },
    ],
    tests,
  },
  {
    name: 'five digits complete the code',
    edits: [
      {
        file: '../src/otp-field/app.ts',
        find: "return code.length === LENGTH && model.cells.every(cell => cell !== '') ? code : null",
        replace: 'return code.length >= LENGTH - 1 ? code : null',
      },
    ],
    tests,
  },
]
