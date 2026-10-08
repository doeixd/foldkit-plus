/**
 * The alert-dialog example, broken in turn:
 * `pnpm mutate examples/widgets/test/alert-dialog.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = ['examples/widgets/test/alert-dialog.test.ts']

export default [
  {
    name: 'confirming cancels',
    edits: [
      {
        file: '../src/alert-dialog/app.ts',
        find: "return { model: { ...model, open: false, answer: 'confirmed' } }",
        replace: "return { model: { ...model, open: false, answer: 'cancelled' } }",
      },
    ],
    tests,
  },
  {
    name: 'a dismissal answers for the user',
    edits: [
      {
        file: '../src/alert-dialog/app.ts',
        find: 'onOut: (_out: DismissLayer.Dismiss) => (model: Model) => ({ model }),',
        replace:
          'onOut: (out: DismissLayer.Dismiss) => (model: Model) => ({ model: out.ids.length > 0 ? { ...model, open: false } : model }),',
      },
    ],
    tests,
    survives:
      'the explicit policy (outside and escape both false) means the stack never emits Dismiss, so no test can deliver one; the opt-out marks test pins the policy instead',
  },
  {
    name: 'escape dismisses after all',
    edits: [
      {
        file: '../src/alert-dialog/view.ts',
        find: 'dismiss: { outside: false, escape: false },',
        replace: 'dismiss: { outside: false, escape: true },',
      },
    ],
    tests,
  },
]
