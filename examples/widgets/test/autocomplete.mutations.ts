/**
 * The autocomplete example, broken in turn:
 * `pnpm mutate examples/widgets/test/autocomplete.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = ['examples/widgets/test/autocomplete.test.ts']

export default [
  {
    name: 'picking leaves the popup open',
    edits: [
      {
        file: '../src/autocomplete/app.ts',
        find: 'query: id,\n  open: false,',
        replace: 'query: id,\n  open: true,',
      },
    ],
    tests,
  },
  {
    name: 'dismissing picks the highlight',
    edits: [
      {
        file: '../src/autocomplete/app.ts',
        find: 'model: model.open ? { ...model, open: false } : model,',
        replace: 'model: model.open ? { ...model, open: false, picked: model.query } : model,',
      },
    ],
    tests,
  },
  {
    name: 'the popup locks the page',
    edits: [
      {
        file: '../src/autocomplete/view.ts',
        find: 'policy: Overlay.nonModal,',
        replace: 'policy: Overlay.modal,',
      },
    ],
    tests,
  },
]
