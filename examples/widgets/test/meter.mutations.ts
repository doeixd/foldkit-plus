/**
 * The meter example, broken in turn:
 * `pnpm mutate examples/widgets/test/meter.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = ['examples/widgets/test/meter.test.ts']

export default [
  {
    name: 'usage escapes the quota',
    edits: [
      {
        file: '../src/meter/app.ts',
        find: 'const used = clamp(message.used)',
        replace: 'const used = message.used',
      },
    ],
    tests,
  },
  {
    name: 'the meter reports nothing',
    edits: [
      {
        file: '../src/meter/view.ts',
        find: "h.meter([h.Value(String(model.used)), h.Min('0'), h.Max(String(QUOTA))], [`${model.used} of ${QUOTA} GB`]),",
        replace: 'h.meter([], [`${model.used} of ${QUOTA} GB`]),',
      },
    ],
    tests,
  },
]
