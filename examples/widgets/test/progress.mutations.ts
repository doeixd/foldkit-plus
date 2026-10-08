/**
 * The progress example, broken in turn:
 * `pnpm mutate examples/widgets/test/progress.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = ['examples/widgets/test/progress.test.ts']

export default [
  {
    name: 'sent escapes the total',
    edits: [
      {
        file: '../src/progress/app.ts',
        find: 'const sent = clamp(message.sent)',
        replace: 'const sent = message.sent',
      },
    ],
    tests,
  },
  {
    name: 'the bar reports nothing',
    edits: [
      {
        file: '../src/progress/view.ts',
        find: 'slots.bar.attrs([h.Value(String(model.sent)), h.Max(String(TOTAL))]),',
        replace: 'slots.bar.attrs([]),',
      },
    ],
    tests,
  },
  {
    name: 'an unknown total still reports a value',
    edits: [
      {
        file: '../src/progress/view.ts',
        find: ': h.progress(slots.bar.attrs([]), [',
        replace: ': h.progress(slots.bar.attrs([h.Value(String(model.sent))]), [',
      },
    ],
    tests,
  },
]
