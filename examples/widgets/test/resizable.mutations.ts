/**
 * The resizable example, broken in turn:
 * `pnpm mutate examples/widgets/test/resizable.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = ['examples/widgets/test/resizable.test.ts']

export default [
  {
    name: 'shares escape their bounds',
    edits: [
      {
        file: '../src/resizable/app.ts',
        find: 'const clamped = Math.min(MAX, Math.max(MIN, share))',
        replace: 'const clamped = share',
      },
    ],
    tests,
  },
  {
    name: 'drags accumulate instead of measuring from the start',
    edits: [
      {
        file: '../src/resizable/app.ts',
        find: 'const first = clampShare(model.from + message.delta / model.width)',
        replace: 'const first = clampShare(model.first + message.delta / model.width)',
      },
    ],
    tests,
  },
  {
    name: 'moves size the unknown',
    edits: [
      {
        file: '../src/resizable/app.ts',
        find: 'if (model.from === null || model.width <= 0) return { model }',
        replace: 'if (model.from === null) return { model }',
      },
    ],
    tests,
  },
  {
    name: 'the separator reports no range',
    edits: [
      {
        file: '../src/resizable/view.ts',
        find: 'h.AriaValuenow(pct),',
        replace: '',
      },
    ],
    tests,
  },
]
