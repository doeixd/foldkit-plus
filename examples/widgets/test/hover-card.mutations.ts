/**
 * The hover-card example, broken in turn:
 * `pnpm mutate examples/widgets/test/hover-card.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = ['examples/widgets/test/hover-card.test.ts']

export default [
  {
    name: 'leaving keeps the card',
    edits: [
      {
        file: '../src/hover-card/app.ts',
        find: "case 'Left':\n      return model.open ? { model: { ...model, open: false } } : { model }",
        replace: "case 'Left':\n      return { model }",
      },
    ],
    tests,
  },
  {
    name: 'the card locks the page',
    edits: [
      {
        file: '../src/hover-card/view.ts',
        find: 'policy: Overlay.nonModal,',
        replace: 'policy: Overlay.modal,',
      },
    ],
    tests,
  },
]
