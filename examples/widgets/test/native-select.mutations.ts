/**
 * The native select example, broken in turn:
 * `pnpm mutate examples/widgets/test/native-select.mutations.ts` checks that
 * a test fails for every one.
 */
const tests = ['examples/widgets/test/native-select.test.ts']

export default [
  {
    name: 'any channel goes, listed or not',
    edits: [
      {
        file: '../src/native-select/app.ts',
        find: 'if (isChannel(message.value) === false || message.value === model.value) return { model }',
        replace: 'if (message.value === model.value) return { model }',
      },
    ],
    tests,
  },
  {
    name: 'the select reports nothing',
    edits: [
      {
        file: '../src/native-select/view.ts',
        find: 'h.Value(model.value),\n              h.OnChange(value => Message.SetValue({ value })),',
        replace: 'h.OnChange(value => Message.SetValue({ value })),',
      },
    ],
    tests,
  },
]
