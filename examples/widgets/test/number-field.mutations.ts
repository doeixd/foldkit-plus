/**
 * The number-field example, broken in turn:
 * `pnpm mutate examples/widgets/test/number-field.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = ['examples/widgets/test/number-field.test.ts']

export default [
  {
    name: 'the value escapes the bounds',
    edits: [
      {
        file: '../src/number-field/app.ts',
        find: 'const value = clamp(message.value)',
        replace: 'const value = message.value',
      },
    ],
    tests,
  },
  {
    name: 'decrease stays live at the minimum',
    edits: [
      {
        file: '../src/number-field/view.ts',
        find: "atMin\n              ? [h.AriaDisabled(true), h.AriaLabel('Decrease (at minimum)')]",
        replace:
          "atMin\n              ? [h.OnClick(Message.SetValue({ value: 0 })), h.AriaLabel('Decrease')]",
      },
    ],
    tests,
  },
  {
    name: 'the control loses its spinbutton role',
    edits: [
      {
        file: '../src/number-field/view.ts',
        find: 'Behavior.attach(Spin),',
        replace: '',
      },
    ],
    tests,
  },
]
